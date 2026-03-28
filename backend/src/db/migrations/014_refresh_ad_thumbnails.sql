-- Force re-fetch of ad thumbnails to get full-resolution image_url instead of low-res thumbnail_url
UPDATE ads SET thumbnail_url = NULL, creative_id = NULL;
