# Cloudflare R2 CORS Configuration for Canvas Operations

## Required CORS Configuration

For `html-to-image` to properly capture screenshots with external images, your R2 bucket needs these specific CORS headers:

### Via Cloudflare Dashboard:

1. Go to your R2 bucket in the Cloudflare Dashboard
2. Navigate to **Settings** → **CORS Policy**
3. Add the following configuration:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

### Critical Headers for Canvas Operations:

- **Access-Control-Allow-Origin**: Must include your app's origin (or `*` for testing)
- **Access-Control-Allow-Methods**: Must include `GET`
- **Access-Control-Allow-Headers**: Should allow common headers

### Verification Steps:

1. Upload an image to your R2 bucket
2. Open browser DevTools → Network tab
3. Load the image URL and check Response Headers:
   - Should include: `access-control-allow-origin: *` (or your domain)
   - Should include: `access-control-allow-methods: GET, HEAD`

### Testing CORS:

Run this in your browser console with one of your R2 image URLs:

```javascript
fetch('YOUR_R2_IMAGE_URL', { method: 'GET' })
  .then(response => {
    console.log('CORS Headers:', {
      'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
      'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
    });
  })
  .catch(err => console.error('CORS Error:', err));
```

### Alternative: Use Custom Domain with Cloudflare

If using a custom domain for R2:
1. The domain should be under the same Cloudflare zone as your app
2. Or configure appropriate CORS headers via Transform Rules

## Changes Made to Fix the Issue

✅ Added `crossOrigin="anonymous"` to all `<img>` tags in:
- `components/workflow-editor/nodes/image-upload-node.tsx`
- `components/workflow-editor/nodes/models/image-model-node.tsx`

✅ Added `crossOrigin="anonymous"` to `<video>` tag in:
- `components/workflow-editor/nodes/models/video-model-node.tsx`

✅ Improved thumbnail generation with:
- Extended delay for image loading (500ms)
- Better error handling
- Additional options (`cacheBust`, `includeQueryParams`)
- More complete filter for React Flow UI elements

## If Issue Persists:

1. Clear browser cache completely
2. Check browser console for specific CORS errors
3. Verify R2 bucket is public or has correct CORS policy
4. Test with a different browser to rule out caching issues
