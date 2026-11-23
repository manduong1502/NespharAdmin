const TOKEN_KEY = "nesphar_admin_token_v1";

export function getStoredToken(): string {
  return window.localStorage.getItem(TOKEN_KEY) || "";
}

export function setStoredToken(token: string): void {
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`/api/v1/admin${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    setStoredToken("");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Yêu cầu thất bại (${response.status})`);
  }
  return data as T;
}

export async function uploadAdminFile(
  file: File,
  folder: "media" | "docs" = "media"
): Promise<{ url: string; fileName: string; originalName: string; size: number }> {
  const form = new FormData();
  form.append("file", file);
  return apiRequest(`/upload?folder=${folder}`, {
    method: "POST",
    body: form,
  });
}

export async function downloadAdminCsv(
  resource: "orders" | "products" | "batches" | "inventory" | "customers" | "movements"
): Promise<void> {
  const token = getStoredToken();
  const res = await fetch(`/api/v1/admin/export/${resource}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error("Không thể kết xuất tệp CSV. Vui lòng kiểm tra quyền hạn đăng nhập.");
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = cd.match(/filename="([^"]+)"/);
  const fileName = match ? match[1] : `nesphar-${resource}.csv`;

  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(blobUrl);
}

export async function downloadProductTemplateXlsx(): Promise<void> {
  const token = getStoredToken();
  const res = await fetch(`/api/v1/admin/products/template-xlsx`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error("Không thể tải tệp khuôn mẫu Excel.");
  }
  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = "MAU_NHAP_SAN_PHAM_NESPHAR.xlsx";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(blobUrl);
}

export async function importProductsXlsx(
  file: File
): Promise<{ ok: boolean; importedProducts: number; importedBatches: number }> {
  const form = new FormData();
  form.append("file", file);
  return apiRequest(`/products/import-xlsx`, {
    method: "POST",
    body: form,
  });
}
