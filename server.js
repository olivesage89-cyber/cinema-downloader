const express = require("express");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const app = express();
app.use(express.json({ limit: "1mb" }));
const SUPA_FN = process.env.SUPA_FN || "https://pujsrxpveyecbogqnmad.supabase.co/functions/v1/Identify";
const SUPA_ANON = process.env.SUPA_ANON || "";
app.get("/", (_req, res) => res.send("Cinema downloader is up"));
app.post("/identify", async (req, res) => {
  const url = req.body && req.body.url;
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: "no url" });
  if (!SUPA_ANON) return res.status(500).json({ error: "SUPA_ANON not set" });
  const id = crypto.randomBytes(6).toString("hex");
  const out = path.join(os.tmpdir(), `clip_${id}.mp4`);
  const t0 = Date.now();
  try {
    await download(url, out);
    if (!fs.existsSync(out) || !fs.statSync(out).size) throw new Error("download produced no file");
    const buf = fs.readFileSync(out);
    console.log("downloaded", url, "->", buf.length, "bytes in", (Date.now() - t0) + "ms");
    const t1 = Date.now();
    const r = await fetch(SUPA_FN, {
      method: "POST",
      headers: { "Authorization": "Bearer " + SUPA_ANON, "apikey": SUPA_ANON, "Content-Type": "video/mp4" },
      body: buf,
    });
    const text = await r.text();
    console.log("identify took", (Date.now() - t1) + "ms, status", r.status);
    let j = null;
    try { j = JSON.parse(text); } catch (_e) {}
    if (!j) return res.status(502).json({ error: "identify returned non-json", raw: text.slice(0, 200) });
    res.json(j);
  } catch (e) {
    console.error("fail:", String(e));
    res.status(500).json({ error: "download/identify failed", detail: String(e).slice(0, 300) });
  } finally {
    fs.unlink(out, () => {});
  }
});

// TikTok frequently refuses its default API host from datacenter IPs ("Video not
// available, status code 0"). Retrying against alternate API hosts is the standard
// cookie-free workaround, so for TikTok we try a few before giving up.
const TIKTOK_HOSTS = [
  "api22-normal-c-useast2a.tiktokv.com",
  "api16-normal-c-useast1a.tiktokv.com",
  "api19-normal-c-alisg.tiktokv.com",
];

function baseArgs(out, url, extra) {
  return [
    "-f", "best[height<=720][ext=mp4]/best[height<=720]/best/mp4/b",
    "--merge-output-format", "mp4",
    "--max-filesize", "60m",
    "--no-playlist",
    "--no-warnings",
    "--no-part",
    "--socket-timeout", "15",
    "--retries", "3",
    "--fragment-retries", "3",
    "--concurrent-fragments", "4",
    "--force-ipv4",
    "--user-agent",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    ...(extra || []),
    "-o", out,
    url,
  ];
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    execFile("yt-dlp", args, { timeout: 60000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 * 16 }, (err, _stdout, stderr) => {
      if (stderr) console.log("yt-dlp stderr:", String(stderr).slice(0, 600));
      if (err) {
        if (err.killed) return reject(new Error("yt-dlp timed out (60s) fetching the video"));
        return reject(new Error((stderr || err.message).slice(0, 300)));
      }
      resolve();
    });
  });
}

async function download(url, out) {
  const isTikTok = /tiktok\.com|vt\.tiktok|vm\.tiktok/i.test(url);
  // For non-TikTok, one plain attempt. For TikTok, try the default first, then each alt host.
  const attempts = isTikTok
    ? [null, ...TIKTOK_HOSTS].map((h) => (h ? ["--extractor-args", "tiktok:api_hostname=" + h] : []))
    : [[]];
  let lastErr = null;
  for (let i = 0; i < attempts.length; i++) {
    try {
      console.log("download attempt", i + 1, "of", attempts.length, isTikTok ? "(tiktok)" : "");
      await runYtDlp(baseArgs(out, url, attempts[i]));
      return; // success
    } catch (e) {
      lastErr = e;
      console.log("attempt", i + 1, "failed:", String(e).slice(0, 200));
    }
  }
  throw lastErr || new Error("download failed");
}
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Cinema downloader listening on " + PORT));
