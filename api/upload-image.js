module.exports = function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ message: "Method not allowed." });
    return;
  }

  res.status(501).json({
    message:
      "Image upload is not supported on this deployment target yet. Use external object storage (e.g. Supabase Storage or Vercel Blob) for uploads."
  });
};
