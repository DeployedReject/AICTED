CREATE VIRTUAL TABLE official_search USING fts5(name,id,designation,bureau,content='officials',content_rowid='rowid',tokenize='unicode61');
INSERT INTO official_search(official_search) VALUES('rebuild');
CREATE TRIGGER official_search_insert AFTER INSERT ON officials BEGIN
 INSERT INTO official_search(rowid,name,id,designation,bureau) VALUES(new.rowid,new.name,new.id,new.designation,new.bureau);
END;
CREATE TRIGGER official_search_delete AFTER DELETE ON officials BEGIN
 INSERT INTO official_search(official_search,rowid,name,id,designation,bureau) VALUES('delete',old.rowid,old.name,old.id,old.designation,old.bureau);
END;
CREATE TRIGGER official_search_update AFTER UPDATE OF name,id,designation,bureau ON officials BEGIN
 INSERT INTO official_search(official_search,rowid,name,id,designation,bureau) VALUES('delete',old.rowid,old.name,old.id,old.designation,old.bureau);
 INSERT INTO official_search(rowid,name,id,designation,bureau) VALUES(new.rowid,new.name,new.id,new.designation,new.bureau);
END;
