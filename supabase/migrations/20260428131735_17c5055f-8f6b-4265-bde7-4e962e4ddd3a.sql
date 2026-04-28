-- Aumenta o limite do bucket de vídeos para 1 TB
UPDATE storage.buckets 
SET file_size_limit = 1099511627776
WHERE id = 'videos';