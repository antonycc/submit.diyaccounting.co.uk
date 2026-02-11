#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// build-sitemaps.cjs — Generate sitemap.xml for gateway and spreadsheets sites
//
// Usage:
//   node scripts/build-sitemaps.cjs
//
// Reads:  web/spreadsheets.diyaccounting.co.uk/public/knowledge-base.toml
//         web/spreadsheets.diyaccounting.co.uk/public/catalogue.toml
// Writes: web/www.diyaccounting.co.uk/public/sitemap.xml
//         web/spreadsheets.diyaccounting.co.uk/public/sitemap.xml

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const KB_TOML = path.join(ROOT, "web", "spreadsheets.diyaccounting.co.uk", "public", "knowledge-base.toml");
const CATALOGUE_TOML = path.join(ROOT, "web", "spreadsheets.diyaccounting.co.uk", "public", "catalogue.toml");
const GATEWAY_SITEMAP = path.join(ROOT, "web", "www.diyaccounting.co.uk", "public", "sitemap.xml");
const SPREADSHEETS_SITEMAP = path.join(ROOT, "web", "spreadsheets.diyaccounting.co.uk", "public", "sitemap.xml");

// Minimal TOML parser (same as build-gateway-redirects.cjs)
function parseTOML(src) {
  var res = {};
  var currentSection = res;
  var lines = src.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("[[")) {
      var name = line.substring(2, line.lastIndexOf("]]")).trim();
      if (!res[name]) res[name] = [];
      var entry = {};
      res[name].push(entry);
      currentSection = entry;
      continue;
    }
    if (line.startsWith("[")) {
      var tname = line.substring(1, line.lastIndexOf("]")).trim();
      if (!res[tname]) res[tname] = {};
      currentSection = res[tname];
      continue;
    }
    var eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    var key = line.substring(0, eqIdx).trim();
    var val = line.substring(eqIdx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
    else if (val === "true") val = true;
    else if (val === "false") val = false;
    else if (val.startsWith("[") && val.endsWith("]")) {
      var inner = val.substring(1, val.length - 1).trim();
      val = inner
        ? inner.split(",").map(function (v) {
            v = v.trim();
            return v.startsWith('"') && v.endsWith('"') ? v.substring(1, v.length - 1) : v;
          })
        : [];
    } else if (!isNaN(val) && val !== "") val = Number(val);
    currentSection[key] = val;
  }
  return res;
}

// Convert new slug back to old PascalCase article ID (for gateway sitemap)
function slugToOldId(slug) {
  return (
    slug
      .split("-")
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join("") + "Article"
  );
}

// Read knowledge base articles
var articles = [];
if (fs.existsSync(KB_TOML)) {
  var kb = parseTOML(fs.readFileSync(KB_TOML, "utf8"));
  articles = kb.article || [];
}

// Read catalogue products
var products = [];
if (fs.existsSync(CATALOGUE_TOML)) {
  var cat = parseTOML(fs.readFileSync(CATALOGUE_TOML, "utf8"));
  products = cat.products || [];
}

// Old product IDs for gateway sitemap
var oldProducts = ["BasicSoleTraderProduct", "CompanyAccountsProduct", "TaxiDriverProduct", "SelfEmployedProduct", "PayslipProduct"];

// Old feature IDs for gateway sitemap
var oldFeatures = [
  "CashandBankFeature",
  "CompanyFinalAccountsFeature",
  "CompanyProfitandLossFeature",
  "CompanyPurchaseSpreadsheetFeature",
  "CompanySalesSpreadsheetFeature",
  "PayslipsFeature",
  "ProfitAndLossFeature",
  "PurchaseSpreadsheetFeature",
  "SECashandBankFeature",
  "SEProfitandLossFeature",
  "SEPurchaseSpreadsheetFeature",
  "SESalesSpreadsheetFeature",
  "SETaxReturnFeature",
  "SEVATReturnFeature",
  "SalesInvoiceFeature",
  "SalesSpreadsheetFeature",
  "SelfAssessmentFeature",
  "SelfEmployedTaxFeature",
  "TaxandAssetsFeature",
  "TaxiExpensesFeature",
  "TaxiIncomeTaxFeature",
  "TaxiProfitandLossFeature",
  "TaxiReceiptsFeature",
  "TaxiSATaxFeature",
  "TaxiVATFeature",
  "VatReturnsFeature",
  "YearEndAccountsFeature",
];

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// === Generate gateway sitemap.xml ===
var gw = [];
gw.push('<?xml version="1.0" encoding="UTF-8"?>');
gw.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

// Current pages
gw.push("  <url><loc>https://diyaccounting.co.uk/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>");
gw.push("  <url><loc>https://diyaccounting.co.uk/about.html</loc><changefreq>yearly</changefreq><priority>0.8</priority></url>");

// Old navigational pages (will 301 redirect)
var oldNav = ["products.html", "articles.html", "get.html", "whatsnew.html", "support.html", "contact.html", "history.html"];
for (var n of oldNav) {
  gw.push("  <url><loc>https://diyaccounting.co.uk/" + n + "</loc></url>");
}

// Old product pages (will 301 redirect to spreadsheets download)
for (var p of oldProducts) {
  gw.push("  <url><loc>https://diyaccounting.co.uk/product.html?product=" + escapeXml(p) + "</loc><priority>0.9</priority></url>");
}

// Old feature pages (will 301 redirect to spreadsheets knowledge base)
for (var f of oldFeatures) {
  gw.push("  <url><loc>https://diyaccounting.co.uk/feature.html?feature=" + escapeXml(f) + "</loc><priority>0.8</priority></url>");
}

// Old article pages (will 301 redirect to spreadsheets articles)
for (var a of articles) {
  var oldId = slugToOldId(a.id);
  gw.push("  <url><loc>https://diyaccounting.co.uk/article.html?article=" + escapeXml(oldId) + "</loc><priority>0.7</priority></url>");
}

gw.push("</urlset>");
gw.push("");

fs.writeFileSync(GATEWAY_SITEMAP, gw.join("\n"), "utf8");
console.log("Gateway sitemap: " + GATEWAY_SITEMAP + " (" + (gw.length - 3) + " URLs)");

// === Generate spreadsheets sitemap.xml ===
var sp = [];
sp.push('<?xml version="1.0" encoding="UTF-8"?>');
sp.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

// Main pages
sp.push("  <url><loc>https://spreadsheets.diyaccounting.co.uk/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>");
sp.push(
  "  <url><loc>https://spreadsheets.diyaccounting.co.uk/download.html</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>",
);
sp.push(
  "  <url><loc>https://spreadsheets.diyaccounting.co.uk/donate.html</loc><changefreq>yearly</changefreq><priority>0.5</priority></url>",
);
sp.push(
  "  <url><loc>https://spreadsheets.diyaccounting.co.uk/knowledge-base.html</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>",
);

// Product download pages
for (var prod of products) {
  sp.push(
    "  <url><loc>https://spreadsheets.diyaccounting.co.uk/download.html?product=" +
      escapeXml(prod.id) +
      "</loc><priority>0.9</priority></url>",
  );
}

// Knowledge base articles
for (var art of articles) {
  sp.push("  <url><loc>https://spreadsheets.diyaccounting.co.uk/articles/" + escapeXml(art.id) + ".md</loc><priority>0.7</priority></url>");
}

sp.push("</urlset>");
sp.push("");

fs.writeFileSync(SPREADSHEETS_SITEMAP, sp.join("\n"), "utf8");
console.log("Spreadsheets sitemap: " + SPREADSHEETS_SITEMAP + " (" + (sp.length - 3) + " URLs)");
