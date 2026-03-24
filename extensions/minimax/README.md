# MiniMax Extension for pi

AI-powered extension providing web search, image understanding, image generation, music generation, lyrics generation, and video generation tools.

## Tools

### `web_search`
Search the web and get structured results with titles, URLs, snippets, and related searches.

### `understand_image`
Analyze images using AI - supports URLs and local file paths.

### `generate_image`
Generate images from text prompts using MiniMax AI.

**Parameters:**
- `prompt` (required): Text description of the image to generate (max 1500 characters)
- `model` (optional): Model to use, default "image-01"
- `aspect_ratio` (optional): Image aspect ratio - "1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"
- `width`/`height` (optional): Specific dimensions in pixels (512-2048, divisible by 8)
- `response_format` (optional): "url" (default, expires 24h) or "base64"
- `seed` (optional): Random seed for reproducible generation
- `n` (optional): Number of images to generate (1-9, default 1)
- `prompt_optimizer` (optional): Enable automatic prompt optimization

### `transform_image`
Transform an existing image using AI (image-to-image generation). Takes a source image and generates a new image based on the text prompt.

**Parameters:**
- `prompt` (required): Text description of the desired transformation (max 1500 characters)
- `image` (required): Source image - URL, local path, or base64 data URL
- `model` (optional): Model to use, default "image-01"
- `subject_type` (optional): Type of subject reference, default "character"
- `aspect_ratio` (optional): Image aspect ratio - "1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"
- `width`/`height` (optional): Specific dimensions in pixels (512-2048, divisible by 8)
- `response_format` (optional): "url" (default, expires 24h) or "base64"
- `seed` (optional): Random seed for reproducible generation
- `n` (optional): Number of images to generate (1-9, default 1)
- `prompt_optimizer` (optional): Enable automatic prompt optimization

### `generate_music`
Generate music using MiniMax AI. Creates original music tracks based on text descriptions of style, mood, and scenario. Can optionally include lyrics with structure tags like [Verse], [Chorus], [Bridge].

**Parameters:**
- `prompt` (optional): Music description - style, mood, scenario (1-2000 chars). Required if no lyrics provided.
- `lyrics` (optional): Song lyrics with structure tags like [Verse], [Chorus], [Bridge] (1-3500 chars). Required if no prompt provided.
- `model` (optional): Model to use, default "music-2.5+"
- `is_instrumental` (optional): Generate instrumental only (without vocals), default false
- `output_format` (optional): "url" (default) or "hex"
- `sample_rate` (optional): Audio sample rate - 16000, 24000, 32000, or 44100 Hz
- `bitrate` (optional): Audio bitrate - 32000, 64000, 128000, or 256000 bps
- `audio_format` (optional): Audio format - "mp3" (default), "wav", or "pcm"
- `lyrics_optimizer` (optional): Automatically generate lyrics from the prompt, default false

### `generate_lyrics`
Generate song lyrics using MiniMax AI. Creates original lyrics with structural tags like [Verse], [Chorus], [Bridge]. The generated lyrics can be used with the generate_music tool.

**Parameters:**
- `mode` (optional): Generation mode - "write_full_song" (default) or "edit"
- `prompt` (optional): Theme, style, or instructions (max 2000 chars)
- `lyrics` (optional): Existing lyrics to edit/continue (only for edit mode, max 3500 chars)
- `title` (optional): Desired song title

### `generate_video`
Generate videos from text prompts using MiniMax AI. Video generation is asynchronous and returns a task_id for tracking.

**Parameters:**
- `prompt` (required): Text description of the video (max 2000 chars). Supports camera commands like [Pedestal up], [Static shot], [Pan left]
- `model` (optional): Model to use - "MiniMax-Hailuo-2.3" (default), "MiniMax-Hailuo-02", "T2V-01-Director", or "T2V-01"
- `prompt_optimizer` (optional): Auto-optimize prompt, default true
- `fast_pretreatment` (optional): Reduces optimization time for specific models
- `duration` (optional): Video duration in seconds, default 6
- `resolution` (optional): Video resolution - "720P", "768P", or "1080P"
- `callback_url` (optional): Webhook URL for async status updates

### `generate_video_from_image`
Generate a video from an image using MiniMax AI (image-to-video). Takes a source image and generates a video based on the text prompt and camera commands.

**Parameters:**
- `image` (required): Source image - URL, local path, or base64 data URL (JPG, PNG, WebP; short edge >300px)
- `prompt` (optional): Video description (max 2000 chars). Supports camera commands like [Pan left], [Zoom in]
- `model` (optional): Model to use - "MiniMax-Hailuo-2.3" (default), "MiniMax-Hailuo-2.3-Fast", "MiniMax-Hailuo-02", "I2V-01-Director", "I2V-01-live", or "I2V-01"
- `prompt_optimizer` (optional): Auto-optimize prompt, default true
- `fast_pretreatment` (optional): Reduces optimization time (2.3/2.3-Fast/02 models only)
- `duration` (optional): Video duration in seconds, default 6
- `resolution` (optional): Video resolution - "512P", "720P", "768P", or "1080P"
- `callback_url` (optional): Webhook URL for async status updates

### `generate_video_with_frames`
Generate a video from first and last frame images using MiniMax AI (first-last frame video). Creates a video transition from start to end frame.

**Parameters:**
- `last_frame_image` (required): Ending frame - URL, local path, or base64 data URL (JPG, PNG, WebP; short edge >300px)
- `first_frame_image` (optional): Starting frame - URL, local path, or base64 data URL
- `prompt` (optional): Video description (max 2000 chars). Supports camera commands like [Pan left], [Zoom in]
- `model` (optional): Model to use - "MiniMax-Hailuo-02" (default)
- `prompt_optimizer` (optional): Auto-optimize prompt, default true
- `duration` (optional): Video duration in seconds (6 or 10), default 6
- `resolution` (optional): Video resolution - "768P" or "1080P" (10s only supports 768P)
- `callback_url` (optional): Webhook URL for async status updates

### `generate_video_with_subject`
Generate a video with a subject reference using MiniMax AI (S2V). Uses a character image reference to generate videos featuring that subject.

**Parameters:**
- `subject_image` (required): Subject reference image - URL, local path, or base64 data URL (JPG, PNG, WebP; short edge >300px)
- `prompt` (optional): Video description (max 2000 chars)
- `prompt_optimizer` (optional): Auto-optimize prompt, default true
- `callback_url` (optional): Webhook URL for async status updates

### `query_video`
Query the status of a video generation task. Use the task_id returned from generate_video to check if the video is ready.

**Parameters:**
- `task_id` (required): The task ID to query

### `download_video`
Get the download URL for a generated video. Use the file_id returned from query_video to get the download URL.

**Parameters:**
- `file_id` (required): The file ID returned from query_video

**Note:** The download URL expires after 1 hour.

## Setup

### 1. Get MiniMax API Key

1. Sign up at [MiniMax Platform](https://www.minimax.io/platform)
2. Get your API key from your account settings
3. Note your region and corresponding API host:
   - **Global**: `https://api.minimax.io`
   - **Mainland China**: `https://api.minimax.cn`

### 2. Configure Environment Variables

Set the required environment variables before running pi:

```bash
# For Global users
export MINIMAX_API_KEY="your-api-key-here"
export MINIMAX_API_HOST="https://api.minimax.io"

# For Mainland China users
export MINIMAX_API_KEY="your-api-key-here"
export MINIMAX_API_HOST="https://api.minimax.cn"
```

### 3. Add to pi Settings

pi install https://github.com/joshleblanc/pi-minimax
```

## Usage

### Web Search Example
```
Search for: "latest TypeScript features 2024"
```

### Image Analysis Example
```
Analyze: "./screenshot.png"
Prompt: "What does this diagram show?"
```

### Image Generation Example
```
Generate an image with prompt: "A serene beach at sunset with palm trees"
Aspect ratio: 16:9
Number of images: 2
```

### Image Transformation Example
```
Transform an image with:
  Prompt: "A girl looking into the distance from a library window"
  Image: "./portrait.png"
  Aspect ratio: 16:9
```

### Music Generation Example
```
Generate music with:
  Prompt: "Indie folk, melancholic, introspective"
  Model: music-2.5+
```

### Music Generation with Lyrics Example
```
Generate music with:
  Lyrics: "[Verse 1]\nStreetlights flicker in the rain\n[Verse 2]\nMemories fade like yesterday"
  Prompt: "Acoustic folk ballad"
  Model: music-2.5+
```

### Lyrics Generation Example
```
Generate lyrics with:
  Mode: write_full_song
  Prompt: "A cheerful love song about a summer day at the beach"
  Title: "Summer Breeze Promise"
```

### Video Generation Example
```
Generate video with:
  Prompt: "A man picks up a book [Pedestal up], then reads [Static shot]"
  Model: MiniMax-Hailuo-2.3
  Duration: 6
  Resolution: 1080P
```

### Image-to-Video Generation Example
```
Generate video from image with:
  Image: "./photo.jpg"
  Prompt: "A mouse runs toward the camera, smiling and blinking [Pan left]"
  Model: MiniMax-Hailuo-2.3
  Duration: 6
  Resolution: 1080P
```

### First/Last Frame Video Generation Example
```
Generate video with frames:
  First frame: "./start.jpg"
  Last frame: "./end.jpg"
  Prompt: "A little girl grow up [Pan right]"
  Model: MiniMax-Hailuo-02
  Duration: 6
  Resolution: 1080P
```

### Subject Reference Video Generation Example
```
Generate video with subject:
  Subject image: "./portrait.jpg"
  Prompt: "A girl runs toward the camera and winks with a smile"
```

### Query Video Status Example
```
Query video status with:
  Task ID: "176843862716480"
```

### Download Video Example
```
Download video with:
  File ID: "176844028768320"
```

## Requirements

- pi-coding-agent
- MINIMAX_API_KEY environment variable
- MINIMAX_API_HOST environment variable (optional, defaults to https://api.minimax.io)
