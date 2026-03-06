const PRODUCTS_TABLE = "products";
const CATEGORY_OPTIONS = ["Cherry", "Flower", "Heart", "Mix", "Pastel"];
const BADGE_OPTIONS = ["NEW", "SALE", "HOT", "LIMITED"];

const pageType = document.body?.dataset?.adminPage || "";
const loginForm = document.getElementById("adminLoginForm");
const loginError = document.getElementById("adminLoginError");
const logoutBtn = document.getElementById("adminLogoutBtn");
const productForm = document.getElementById("productForm");
const productTableBody = document.getElementById("productTableBody");
const formTitle = document.getElementById("productFormTitle");
const formMessage = document.getElementById("productFormMessage");
const productIdInput = document.getElementById("productId");
const existingImagePathInput = document.getElementById("existingImagePath");
const productNameInput = document.getElementById("productName");
const productPriceInput = document.getElementById("productPrice");
const productCategoryInput = document.getElementById("productCategory");
const productDescriptionInput = document.getElementById("productDescription");
const productIsNewInput = document.getElementById("productIsNew");
const productBadgeInput = document.getElementById("productBadge");
const productColorInput = document.getElementById("productColor");
const productImageInput = document.getElementById("productImage");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const loginButton = document.getElementById("adminLoginBtn");
const saveProductBtn = document.getElementById("saveProductBtn");

let supabaseClientPromise = null;
let currentProducts = [];
let usingLegacyColumns = false;
let runtimeConfig = null;

async function getSupabaseClient() {
  if (supabaseClientPromise) {
    return supabaseClientPromise;
  }

  supabaseClientPromise = (async () => {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Supabase JS client is not available.");
    }

    const response = await fetch("/api/config", { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error("Unable to read runtime config.");
    }

    const config = await response.json();
    if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
      throw new Error("Supabase runtime config is missing.");
    }

    runtimeConfig = config;
    return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  })();

  return supabaseClientPromise;
}

function redirectTo(path) {
  window.location.replace(path);
}

function setMessage(message, status = "neutral") {
  if (!formMessage) {
    return;
  }
  formMessage.textContent = message;
  formMessage.classList.remove("form-error", "form-success");
  if (status === "error") {
    formMessage.classList.add("form-error");
  }
  if (status === "success") {
    formMessage.classList.add("form-success");
  }
}

function setLoginError(message) {
  if (!loginError) {
    return;
  }
  loginError.textContent = message;
}

function parseBadgeFromDescription(rawDescription) {
  const text = typeof rawDescription === "string" ? rawDescription.trim() : "";
  const match = text.match(/^\[badge:([A-Za-z0-9_-]{1,16})\]\s*/i);
  if (!match) {
    return {
      badge: "",
      description: text
    };
  }

  const candidate = (match[1] || "").toUpperCase();
  const badge = BADGE_OPTIONS.includes(candidate) ? candidate : "";
  return {
    badge,
    description: text.slice(match[0].length).trim()
  };
}

function encodeDescriptionWithBadge(description, badge) {
  const safeDescription = typeof description === "string" ? description.trim() : "";
  const normalizedBadge = BADGE_OPTIONS.includes((badge || "").toUpperCase()) ? badge.toUpperCase() : "";
  if (!normalizedBadge) {
    return safeDescription;
  }
  return `[badge:${normalizedBadge}] ${safeDescription}`;
}

function createStorageObjectName(fileName) {
  const safeName = (fileName || "image")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `products/${Date.now()}-${randomPart}-${safeName || "image"}`;
}

function createImageCell(pathValue, productName) {
  const img = document.createElement("img");
  img.className = "product-thumb";
  img.alt = productName;
  img.src = pathValue || "";
  img.addEventListener("error", () => {
    img.style.background = "#f3d8df";
    img.removeAttribute("src");
  });
  return img;
}

function getFormValues() {
  const category = CATEGORY_OPTIONS.includes(productCategoryInput.value)
    ? productCategoryInput.value
    : "Cherry";

  const selectedBadge = (productBadgeInput?.value || "").toUpperCase();
  const badge = BADGE_OPTIONS.includes(selectedBadge)
    ? selectedBadge
    : (productIsNewInput.checked ? "NEW" : "");

  return {
    id: productIdInput.value.trim(),
    name: productNameInput.value.trim(),
    price: productPriceInput.value.trim(),
    category,
    description: productDescriptionInput.value.trim(),
    badge,
    is_new: badge === "NEW" || productIsNewInput.checked,
    color: productColorInput.value.trim() || "#F4A7A7",
    image_path: existingImagePathInput.value.trim()
  };
}

function mapProductRow(row) {
  const rawDescription = row.description || row.desc || "";
  const parsedBadge = parseBadgeFromDescription(rawDescription);
  return {
    id: row.id,
    name: row.name || "",
    price: row.price || "",
    category: row.category || "",
    description: parsedBadge.description,
    badge: parsedBadge.badge,
    is_new: Boolean(row.is_new),
    color: row.color || "#F4A7A7",
    image_path: row.image_path || row.image || row.images || ""
  };
}

function toDbPayload(values) {
  const payload = {
    name: values.name,
    price: values.price,
    category: values.category,
    is_new: values.is_new,
    color: values.color
  };

  if (usingLegacyColumns) {
    payload.desc = encodeDescriptionWithBadge(values.description, values.badge);
    payload.image = values.image_path;
  } else {
    payload.description = encodeDescriptionWithBadge(values.description, values.badge);
    payload.image_path = values.image_path;
  }

  return payload;
}

function resetForm() {
  if (!productForm) {
    return;
  }
  productForm.reset();
  productIdInput.value = "";
  existingImagePathInput.value = "";
  productColorInput.value = "#F4A7A7";
  if (productBadgeInput) {
    productBadgeInput.value = "";
  }
  productIsNewInput.checked = false;
  if (formTitle) {
    formTitle.textContent = "Add Product";
  }
  setMessage("");
}

function startEdit(product) {
  productIdInput.value = product.id;
  productNameInput.value = product.name || "";
  productPriceInput.value = product.price || "";
  productCategoryInput.value = CATEGORY_OPTIONS.includes(product.category) ? product.category : "Cherry";
  productDescriptionInput.value = product.description || "";
  productIsNewInput.checked = Boolean(product.is_new);
  if (productBadgeInput) {
    productBadgeInput.value = BADGE_OPTIONS.includes((product.badge || "").toUpperCase())
      ? product.badge.toUpperCase()
      : (product.is_new ? "NEW" : "");
  }
  productColorInput.value = product.color || "#F4A7A7";
  existingImagePathInput.value = product.image_path || "";
  if (productImageInput) {
    productImageInput.value = "";
  }
  if (formTitle) {
    formTitle.textContent = "Edit Product";
  }
  setMessage("");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderProductsTable() {
  if (!productTableBody) {
    return;
  }

  if (!currentProducts.length) {
    productTableBody.innerHTML = `
      <tr>
        <td colspan="6">No products found.</td>
      </tr>
    `;
    return;
  }

  productTableBody.innerHTML = "";
  currentProducts.forEach((product) => {
    const row = document.createElement("tr");

    const imageCell = document.createElement("td");
    imageCell.appendChild(createImageCell(product.image_path, product.name));

    const nameCell = document.createElement("td");
    nameCell.textContent = product.name || "-";

    const priceCell = document.createElement("td");
    priceCell.textContent = product.price || "-";

    const categoryCell = document.createElement("td");
    categoryCell.textContent = product.category || "-";

    const badgeCell = document.createElement("td");
    badgeCell.textContent = product.badge || (product.is_new ? "NEW" : "-");

    const actionsCell = document.createElement("td");
    const actionWrap = document.createElement("div");
    actionWrap.className = "row-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => startEdit(product));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => handleDeleteProduct(product.id, product.name));

    actionWrap.append(editBtn, deleteBtn);
    actionsCell.appendChild(actionWrap);

    row.append(imageCell, nameCell, priceCell, categoryCell, badgeCell, actionsCell);
    productTableBody.appendChild(row);
  });
}

async function uploadImageIfNeeded(file, existingPath = "") {
  if (!file) {
    return null;
  }

  const supabase = await getSupabaseClient();
  const bucketName = runtimeConfig?.supabaseStorageBucket || "product-images";
  const objectPath = createStorageObjectName(file.name);

  const { error: uploadError } = await supabase.storage.from(bucketName).upload(objectPath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined
  });
  if (uploadError) {
    throw new Error(uploadError.message || "Image upload failed.");
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(objectPath);
  const publicUrl = data?.publicUrl || "";
  if (!publicUrl) {
    throw new Error("Unable to get public URL for uploaded image.");
  }

  if (existingPath && existingPath.includes(`/storage/v1/object/public/${bucketName}/`)) {
    const marker = `/storage/v1/object/public/${bucketName}/`;
    const existingObjectPath = existingPath.split(marker)[1] || "";
    if (existingObjectPath) {
      await supabase.storage.from(bucketName).remove([existingObjectPath]);
    }
  }

  return publicUrl;
}

async function loadProducts() {
  const supabase = await getSupabaseClient();
  let rows = [];
  const primaryResult = await supabase
    .from(PRODUCTS_TABLE)
    .select("id,name,price,category,description,is_new,color,image_path,created_at")
    .order("created_at", { ascending: false });

  if (!primaryResult.error) {
    usingLegacyColumns = false;
    rows = primaryResult.data || [];
  } else {
    const fallbackResult = await supabase
      .from(PRODUCTS_TABLE)
      .select("id,name,price,category,desc,is_new,color,image,images,created_at")
      .order("created_at", { ascending: false });

    if (fallbackResult.error) {
      throw fallbackResult.error;
    }

    usingLegacyColumns = true;
    rows = fallbackResult.data || [];
  }

  currentProducts = rows.map(mapProductRow);
  renderProductsTable();
}

async function handleSaveProduct(event) {
  event.preventDefault();
  saveProductBtn.disabled = true;
  setMessage("Saving product...");

  try {
    const supabase = await getSupabaseClient();
    const values = getFormValues();

    if (!values.name || !values.price || !values.description) {
      throw new Error("Name, price, and description are required.");
    }

    const selectedFile = productImageInput?.files?.[0];
    if (selectedFile) {
      const uploadedPath = await uploadImageIfNeeded(selectedFile, values.image_path);
      values.image_path = uploadedPath;
    }

    if (values.id) {
      const dbPayload = toDbPayload(values);
      const { error } = await supabase.from(PRODUCTS_TABLE).update(dbPayload).eq("id", values.id);
      if (error) {
        throw error;
      }
      setMessage("Product updated successfully.", "success");
    } else {
      const insertPayload = toDbPayload(values);
      const { error } = await supabase.from(PRODUCTS_TABLE).insert(insertPayload);
      if (error) {
        throw error;
      }
      setMessage("Product added successfully.", "success");
    }

    resetForm();
    await loadProducts();
  } catch (error) {
    setMessage(error.message || "Failed to save product.", "error");
  } finally {
    saveProductBtn.disabled = false;
  }
}

async function handleDeleteProduct(productId, productName) {
  const isConfirmed = window.confirm(`Delete "${productName}" permanently?`);
  if (!isConfirmed) {
    return;
  }

  setMessage("Deleting product...");
  try {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from(PRODUCTS_TABLE).delete().eq("id", productId);
    if (error) {
      throw error;
    }
    setMessage("Product deleted.", "success");
    await loadProducts();
  } catch (error) {
    setMessage(error.message || "Failed to delete product.", "error");
  }
}

async function requireSessionOrRedirect() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  const hasSession = Boolean(data?.session);
  if (!hasSession) {
    if (pageType === "dashboard") {
      redirectTo("/admin-login");
    }
    return null;
  }

  if (pageType === "login") {
    redirectTo("/admin");
    return null;
  }

  return data.session;
}

async function initLoginPage() {
  await requireSessionOrRedirect();
  if (!loginForm) {
    return;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginError("");
    loginButton.disabled = true;

    try {
      const email = document.getElementById("adminEmail")?.value.trim() || "";
      const password = document.getElementById("adminPassword")?.value || "";
      if (!email || !password) {
        throw new Error("Email and password are required.");
      }

      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }

      redirectTo("/admin");
    } catch (error) {
      setLoginError(error.message || "Login failed.");
    } finally {
      loginButton.disabled = false;
    }
  });
}

async function initDashboardPage() {
  const session = await requireSessionOrRedirect();
  if (!session) {
    return;
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      const supabase = await getSupabaseClient();
      await supabase.auth.signOut();
      redirectTo("/admin-login");
    });
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", resetForm);
  }

  if (productForm) {
    productForm.addEventListener("submit", handleSaveProduct);
  }

  await loadProducts();
}

async function init() {
  try {
    if (pageType === "login") {
      await initLoginPage();
      return;
    }

    if (pageType === "dashboard") {
      await initDashboardPage();
    }
  } catch (error) {
    if (pageType === "login") {
      setLoginError(error.message || "Unable to initialize login.");
      return;
    }
    setMessage(error.message || "Unable to initialize admin dashboard.", "error");
  }
}

init();
