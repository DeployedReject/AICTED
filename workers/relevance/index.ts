import { actor, body, fail, guard, json } from "../shared";
import type { Env } from "../shared";

export default {
  fetch(request: Request, env: Env) {
    return guard(async () => {
      const user = actor(request, env);
      // The publicly documented test account cannot consume AI inference.
      if (user.is_demo)
        fail(
          403,
          "Automatic tagging is unavailable in the public test workspace. Please select tags manually.",
        );
      if (!env.AI)
        fail(
          503,
          "Automatic tagging has not been configured. You can select tags manually.",
        );
      const input = await body(request);
      if (
        typeof input.text !== "string" ||
        input.text.length < 20 ||
        input.text.length > 2500 ||
        !Array.isArray(input.catalogue) ||
        input.catalogue.length > 100
      )
        fail(400, "Invalid tagging request.");
      const language = String(input.language || "english");
      if (
        ![
          "english",
          "hindi",
          "tamil",
          "telugu",
          "bengali",
          "marathi",
          "kannada",
          "gujarati",
          "malayalam",
          "punjabi",
          "urdu",
        ].includes(language)
      )
        fail(400, "Choose a supported language.");
      let english = input.text;
      if (language !== "english") {
        const translated = await env.AI.run("@cf/meta/m2m100-1.2b", {
          text: input.text,
          source_lang: language,
          target_lang: "english",
        });
        if (!translated.translated_text)
          fail(502, "Translation failed. Choose tags manually.");
        english = translated.translated_text;
      }
      const catalogue = input.catalogue as { code: string; label: string }[];
      const texts = [english, ...catalogue.map((tag) => tag.label)],
        vectors: number[][] = [];
      for (let offset = 0; offset < texts.length; offset += 24) {
        const result = await env.AI.run("@cf/baai/bge-small-en-v1.5", {
          text: texts.slice(offset, offset + 24),
        });
        if (
          !result.data ||
          result.data.length !== Math.min(24, texts.length - offset)
        )
          fail(502, "Suggestions are unavailable. Choose tags manually.");
        vectors.push(...result.data);
      }
      const base = vectors[0];
      const norm = (v: number[]) => Math.sqrt(v.reduce((s, n) => s + n * n, 0));
      const suggestions = catalogue
        .map((tag, i) => ({
          ...tag,
          score:
            vectors[i + 1].reduce((s, n, j) => s + n * base[j], 0) /
            (norm(base) * norm(vectors[i + 1])),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      return json({
        suggestions,
        translation: language === "english" ? null : english,
        language,
      });
    });
  },
} satisfies ExportedHandler<Env>;
