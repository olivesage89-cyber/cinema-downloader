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
  try {
    await download(url, out);
    if (!fs.existsSync(out) || !fs.statSync(out).size) throw new Error("download produced no file");
    const buf = fs.readFileSync(out);
    console.log("downloaded", url, "->", buf.length, "bytes");
    const r = await fetch(SUPA_FN, {
      method: "POST",
      headers: { "Authorization": "Bearer " + SUPA_ANON, "apikey": SUPA_ANON, "Content-Type": "video/mp4" },
      body: buf,
    });
    const text = await r.text();
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

function download(url, out) {
  return new Promise((resolve, reject) => {
    const args = [
      "-f", "best[height<=720][ext=mp4]/best[height<=720]/best",
      "--merge-output-format", "mp4",
      "--max-filesize", "60m",
      "--no-playlist",
      "--no-warnings",
      "-o", out,
      url,
    ];
    execFile("yt-dlp", args, { timeout: 90000, maxBuffer: 1024 * 1024 * 8 }, (err, _stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).slice(0, 300)));
      resolve();
    });
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Cinema downloader listening on " + PORT));
