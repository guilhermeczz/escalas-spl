update storage.buckets
set file_size_limit = 31457280,
    allowed_mime_types = array['image/png','image/jpeg']
where id = 'profile-photos';
