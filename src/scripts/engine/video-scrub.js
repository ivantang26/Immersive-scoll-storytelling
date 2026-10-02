// FR-3: scroll-scrubbed video. The file is encoded all-intra (-g 1), so every seek lands on a
// keyframe and is cheap in both directions. We fetch the whole file into a Blob first: range-request
// streaming makes backward seeks stall on iOS Safari, and the file is small (720p ~3.7 MB).
// Progress arrives already lerp-smoothed from the engine.

export class VideoScrub {
  constructor({ video, src, fps = 24 }) {
    this.video = video;
    this.src = src;
    this.fps = fps;
    this.ready = false;
    this.target = 0;
    this.started = false;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
  }

  async load() {
    if (this.started) return;
    this.started = true;
    let url = this.src;
    try {
      const res = await fetch(this.src);
      if (!res.ok) throw new Error(String(res.status));
      url = URL.createObjectURL(await res.blob());
    } catch {
      /* fall back to streaming the original URL */
    }
    this.video.src = url;
    await new Promise((resolve) => {
      if (this.video.readyState >= 1) return resolve();
      this.video.addEventListener('loadedmetadata', resolve, { once: true });
    });
    this.ready = true;
    this.video.addEventListener('seeked', () => this.seek(), { passive: true });
    this.seek();
  }

  update(progress) {
    if (!this.ready) return;
    const d = this.video.duration || 0;
    // Stop half a frame early so the last frame is shown rather than an ended state.
    this.target = Math.min(d - 0.5 / this.fps, Math.max(0, progress * d));
    this.seek();
  }

  seek() {
    const v = this.video;
    // Don't queue seeks: wait for the current one to land, then jump straight to the latest target.
    if (!this.ready || v.seeking) return;
    if (Math.abs(v.currentTime - this.target) < 0.5 / this.fps) return;
    v.currentTime = this.target;
  }
}
