const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE_DIR = __dirname;
const ASSETS_DIR = path.join(BASE_DIR, "assets");

const MIME_TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".js": "application/javascript; charset=UTF-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const STATIC_ROUTES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/catalog.html": "catalog.html",
  "/info.html": "info.html",
  "/order.html": "order.html",
  "/style.css": "style.css",
  "/script.js": "script.js"
};

function loadEnvFromFile() {
  const envPath = path.join(BASE_DIR, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnvFromFile();
const PORT = Number(process.env.PORT || 3000);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=UTF-8" });
  res.end(JSON.stringify(payload));
}

function mapProductRow(row) {
  return {
    name: row.name || "Unnamed Product",
    price: row.price || "Rp 0",
    category: row.category || "Misc",
    desc: row.desc || "",
    isNew: Boolean(row.is_new),
    color: row.color || "#F4A7A7",
    image: row.image || row.images || ""
  };
}

async function fetchProductsByImageColumn(endpoint, serviceRoleKey, imageColumn) {
  endpoint.searchParams.set("select", `name,price,category,desc,is_new,color,${imageColumn}`);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Supabase request failed.");
  }

  const data = await response.json();
  return Array.isArray(data) ? data.map(mapProductRow) : [];
}

async function getProductsFromSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return [];
  }

  const endpoint = new URL("/rest/v1/products", supabaseUrl);
  endpoint.searchParams.set("order", "name.asc");
  try {
    return await fetchProductsByImageColumn(endpoint, serviceRoleKey, "image");
  } catch (error) {
    const message = error.message || "";
    const missingImageColumn =
      message.includes("column products.image does not exist") ||
      message.includes("\"products.image\"");

    if (!missingImageColumn) {
      throw error;
    }

    endpoint.searchParams.delete("select");
    return fetchProductsByImageColumn(endpoint, serviceRoleKey, "images");
  }
}

const server = http.createServer(async (req, res) => {
  const requestPath = req.url.split("?")[0];

  if (requestPath === "/api/products") {
    try {
      const products = await getProductsFromSupabase();
      sendJson(res, 200, { products });
    } catch (error) {
      sendJson(res, 500, {
        message: "Failed to fetch products from Supabase.",
        error: error.message
      });
    }
    return;
  }

  if (STATIC_ROUTES[requestPath]) {
    const filePath = path.join(BASE_DIR, STATIC_ROUTES[requestPath]);
    const ext = path.extname(filePath).toLowerCase();

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=UTF-8" });
        res.end("500 Internal Server Error");
        return;
      }

      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] });
      res.end(data);
    });
    return;
  }

  if (requestPath.startsWith("/assets/")) {
    const safeAssetName = path.basename(requestPath);
    const filePath = path.join(ASSETS_DIR, safeAssetName);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext];

    if (!contentType || ![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
      res.end("404 Not Found");
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
        res.end("404 Not Found");
        return;
      }

      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
  res.end("404 Not Found");
});

server.listen(PORT, () => {
  const hasSupabaseEnv = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const source = hasSupabaseEnv ? "Supabase (primary)" : "local fallback (missing Supabase env)";
  console.log(`Aurora Charmie is running at http://localhost:${PORT}`);
  console.log(`Product data source: ${source}`);
});
