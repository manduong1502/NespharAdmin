import hero1 from "@/static/images/hero-banner-1.jpg";
import hero2 from "@/static/images/hero-banner-2.jpg";
import liver from "@/static/images/prod-liver.jpg";
import omega from "@/static/images/prod-omega.jpg";
import derma from "@/static/images/prod-derma.jpg";
import bpMonitor from "@/static/images/prod-bp-monitor.jpg";
import kidsSyrup from "@/static/images/prod-kids-syrup.jpg";
import medicalKit from "@/static/images/prod-medical-kit.jpg";

export const VISUALS = {
  hero1,
  hero2,
  liver,
  omega,
  derma,
  bpMonitor,
  kidsSyrup,
  medicalKit,
};

const rawCatalogGlobs = import.meta.glob<string>("@/static/catalog/*.jpg", {
  eager: true,
  import: "default",
});

const catalogByFileName: Record<string, string> = {};
Object.keys(rawCatalogGlobs).forEach((fullKey) => {
  const parts = fullKey.split("/");
  const fileName = parts[parts.length - 1];
  if (fileName) {
    catalogByFileName[fileName] = rawCatalogGlobs[fullKey];
  }
});

export function resolveCatalogImage(imageFile: string, categoryId: string): string {
  if (imageFile && catalogByFileName[imageFile]) {
    return catalogByFileName[imageFile];
  }
  if (categoryId === "cty-biocare") return VISUALS.omega;
  if (categoryId === "cty-an-thien") return VISUALS.kidsSyrup;
  return VISUALS.medicalKit;
}
