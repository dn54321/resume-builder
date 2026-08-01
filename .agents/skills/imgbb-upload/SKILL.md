---
name: imgbb-upload
description: Upload images to imgbb and return a URL for use in PR descriptions and Linear comments. Triggers on "upload image", "imgbb", "screenshot url", "image host".
---

# Imgbb Upload

Upload images to imgbb.com and get shareable URLs for PRs and Linear tickets.
GitHub PRs do not support direct image upload — use this to host images and
reference them via markdown.

## API Key

The imgbb API key is in `.env.agent` as `IMGBB_API_KEY`.
Read it with:

```bash
grep IMGBB_API_KEY .env.agent | cut -d= -f2
```

**Important:** Never log or echo the API key in command output.

## Upload Methods

### Method A: File upload (recommended)

```bash
API_KEY=$(grep IMGBB_API_KEY /home/dn54321/projects/resume-v3/.env.agent | cut -d= -f2)
curl -s -F "key=$API_KEY" -F "image=@path/to/screenshot.png" https://api.imgbb.com/1/upload
```

### Method B: Base64 upload

```bash
API_KEY=$(grep IMGBB_API_KEY /home/dn54321/projects/resume-v3/.env.agent | cut -d= -f2)
BASE64=$(base64 -w0 path/to/screenshot.png)
curl -s -F "key=$API_KEY" -F "image=$BASE64" https://api.imgbb.com/1/upload
```

### Method C: URL upload (re-host an existing image)

```bash
API_KEY=$(grep IMGBB_API_KEY /home/dn54321/projects/resume-v3/.env.agent | cut -d= -f2)
curl -s -F "key=$API_KEY" -F "image=https://example.com/image.png" https://api.imgbb.com/1/upload
```

## Response Format

The API returns JSON:

```json
{
  "data": {
    "id": "abc123",
    "url": "https://i.ibb.co/abc123/screenshot.png",
    "display_url": "https://i.ibb.co/abc123/screenshot.png",
    "width": 1920,
    "height": 1080,
    "size": 123456,
    "time": 1234567890,
    "delete_url": "https://i.ibb.co/abc123/delete/key"
  },
  "success": true
}
```

Use `data.url` or `data.display_url` in PR markdown:

```markdown
![Screenshot](https://i.ibb.co/abc123/screenshot.png)
```

## PR Integration

After uploading, include the image URL in the PR body:

```markdown
## Proof of Changes

### Frontend Screenshot
![Login page](https://i.ibb.co/abc123/login.png)

### API Response
![Curl result](https://i.ibb.co/def456/curl.png)
```

## Limitations

- Max file size: 32 MB
- Expiration: images are permanent by default. Use `-F "expiration=86400"` for 24h expiry.
- Rate limits: check imgbb.com/pricing for your API key tier
