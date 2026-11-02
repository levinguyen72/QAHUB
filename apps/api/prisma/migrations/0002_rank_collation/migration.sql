-- LexoRank là chuỗi ASCII (0-9a-z) nên so sánh/sắp xếp phải theo byte (collation "C"):
--  * đúng thứ tự bất kể locale của DB (en_US có thể bỏ qua/đổi thứ tự một số ký tự),
--  * nhanh hơn nhiều so với so sánh theo locale khi sắp xếp hàng chục nghìn dòng.
ALTER TABLE issues       ALTER COLUMN rank TYPE text COLLATE "C";
ALTER TABLE requirements ALTER COLUMN rank TYPE text COLLATE "C";
ALTER TABLE test_cases   ALTER COLUMN rank TYPE text COLLATE "C";
