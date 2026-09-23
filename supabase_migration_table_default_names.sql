-- Masa isimlerinin fiziksel masa ile karismamasi icin bir kez calistirin.
-- Garson ekraninda verilen gecici isim, hesap kapanana kadar korunur.

ALTER TABLE tables ADD COLUMN IF NOT EXISTS default_name TEXT;

-- Mevcut kayitlar icin ilk fiziksel isimleri mevcut bolum/sira duzeninden olustur.
WITH numbered AS (
  SELECT
    id,
    section,
    ROW_NUMBER() OVER (PARTITION BY section ORDER BY id) AS table_number
  FROM tables
  WHERE default_name IS NULL OR default_name = ''
)
UPDATE tables AS t
SET default_name = CASE
  WHEN LOWER(COALESCE(numbered.section, '')) LIKE '%bahce%'
    OR LOWER(COALESCE(numbered.section, '')) LIKE '%bahçe%' THEN 'Bahçe ' || numbered.table_number
  WHEN LOWER(COALESCE(numbered.section, '')) LIKE '%disarisi%'
    OR LOWER(COALESCE(numbered.section, '')) LIKE '%dışarısı%' THEN 'Dışarısı ' || numbered.table_number
  ELSE 'Masa ' || numbered.table_number
END
FROM numbered
WHERE t.id = numbered.id;

UPDATE tables
SET default_name = name
WHERE default_name IS NULL OR default_name = '';

CREATE INDEX IF NOT EXISTS idx_tables_default_name ON tables (default_name);
