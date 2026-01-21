#!/usr/bin/env node
// SPDX-FileCopyrightText: 2025 DIY Accounting Limited
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Generate Compliance Report
 *
 * Generates a markdown compliance report from existing test reports.
 * Does NOT run tests - expects reports to already exist in target/.
 *
 * Usage:
 *   node scripts/generate-compliance-report.js --target URL [--output FILE]
 *
 * Options:
 *   --target URL    Target URL that was tested (required)
 *   --output FILE   Output file (default: COMPLIANCE_REPORT.md)
 *
 * Expected report files in target/:
 *   - accessibility/pa11y-report.txt
 *   - accessibility/axe-results.json
 *   - accessibility/axe-wcag22-results.json
 *   - accessibility/lighthouse-results.json
 *   - penetration/eslint-security.txt
 *   - penetration/npm-audit.json
 *   - penetration/retire.json
 *   - penetration/zap-report.json
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return defaultValue;
};

const targetUrl = getArg("--target", null);
const outputFile = getArg("--output", "COMPLIANCE_REPORT.md");

if (!targetUrl) {
  console.error("Error: --target URL is required");
  console.error("Usage: node scripts/generate-compliance-report.js --target URL [--output FILE]");
  process.exit(1);
}

const targetDir = join(projectRoot, "target");
const accessibilityDir = join(targetDir, "accessibility");
const penetrationDir = join(targetDir, "penetration");

// --- File reading helpers ---

function readJsonFile(path) {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf8"));
    }
  } catch (error) {
    console.warn(`Warning: Could not parse ${path}: ${error.message}`);
  }
  return null;
}

function readTextFile(path) {
  try {
    if (existsSync(path)) {
      return readFileSync(path, "utf8");
    }
  } catch (error) {
    console.warn(`Warning: Could not read ${path}: ${error.message}`);
  }
  return null;
}

function getPackageVersion() {
  const pkg = readJsonFile(join(projectRoot, "package.json"));
  return pkg?.version || "unknown";
}

// --- Report parsing using grep-style pattern matching ---

function parseNpmAudit(auditJson) {
  if (!auditJson) {
    return { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0, found: false };
  }
  const vuln = auditJson.metadata?.vulnerabilities || {};
  return {
    critical: vuln.critical || 0,
    high: vuln.high || 0,
    moderate: vuln.moderate || 0,
    low: vuln.low || 0,
    info: vuln.info || 0,
    total: vuln.total || 0,
    found: true,
  };
}

function parseEslintSecurity(eslintText) {
  if (eslintText === null || eslintText === undefined) {
    return { errors: 0, warnings: 0, found: false };
  }
  // grep pattern: "X problems (Y errors, Z warnings)"
  const summaryMatch = eslintText.match(/(\d+)\s+problems?\s+\((\d+)\s+errors?,\s*(\d+)\s+warnings?\)/);
  if (summaryMatch) {
    return {
      errors: parseInt(summaryMatch[2], 10),
      warnings: parseInt(summaryMatch[3], 10),
      found: true,
    };
  }
  // Empty file or no problems = clean pass
  return { errors: 0, warnings: 0, found: true };
}

function parsePa11yReport(pa11yText) {
  if (!pa11yText) {
    return { passed: 0, failed: 0, total: 0, results: [], found: false };
  }

  const results = [];
  // grep pattern: "> URL - N errors"
  const urlPattern = />\s+(https?:\/\/[^\s]+)\s+-\s+(\d+)\s+errors?/g;
  let match;
  while ((match = urlPattern.exec(pa11yText)) !== null) {
    results.push({
      url: match[1],
      errorCount: parseInt(match[2], 10),
    });
  }

  // grep pattern: "X of Y URLs passed"
  const summaryMatch = pa11yText.match(/(\d+)\s+of\s+(\d+)\s+URLs?\s+passed/);

  const passed = summaryMatch ? parseInt(summaryMatch[1], 10) : results.filter((r) => r.errorCount === 0).length;
  const total = summaryMatch ? parseInt(summaryMatch[2], 10) : results.length;
  const failed = total - passed;

  return { passed, failed, total, results, found: true };
}

function parseAxeResults(axeJson) {
  if (!axeJson || !Array.isArray(axeJson)) {
    return { violations: 0, passes: 0, incomplete: 0, found: false };
  }

  let totalViolations = 0;
  let totalPasses = 0;
  let totalIncomplete = 0;
  const violationDetails = [];

  for (const result of axeJson) {
    const violations = result.violations || [];
    const passes = result.passes || [];
    const incomplete = result.incomplete || [];

    totalViolations += violations.length;
    totalPasses += passes.length;
    totalIncomplete += incomplete.length;

    for (const v of violations) {
      violationDetails.push({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes?.length || 0,
      });
    }
  }

  return {
    violations: totalViolations,
    passes: totalPasses,
    incomplete: totalIncomplete,
    violationDetails,
    found: true,
  };
}

function parseRetireResults(retireJson) {
  if (!retireJson) {
    return { total: 0, high: 0, medium: 0, low: 0, found: false };
  }

  // retire.js format: array of results with vulnerabilities
  let high = 0;
  let medium = 0;
  let low = 0;

  const results = Array.isArray(retireJson) ? retireJson : retireJson.data || [];
  for (const result of results) {
    const vulns = result.results || [];
    for (const vuln of vulns) {
      const vulnerabilities = vuln.vulnerabilities || [];
      for (const v of vulnerabilities) {
        const severity = (v.severity || "").toLowerCase();
        if (severity === "high" || severity === "critical") high++;
        else if (severity === "medium" || severity === "moderate") medium++;
        else low++;
      }
    }
  }

  return { total: high + medium + low, high, medium, low, found: true };
}

function parseLighthouseResults(lighthouseJson) {
  if (!lighthouseJson || !lighthouseJson.categories) {
    return { performance: 0, accessibility: 0, bestPractices: 0, seo: 0, found: false };
  }

  const categories = lighthouseJson.categories;
  return {
    performance: Math.round((categories.performance?.score || 0) * 100),
    accessibility: Math.round((categories.accessibility?.score || 0) * 100),
    bestPractices: Math.round((categories["best-practices"]?.score || 0) * 100),
    seo: Math.round((categories.seo?.score || 0) * 100),
    found: true,
  };
}

function parseZapResults(zapJson) {
  if (!zapJson || !zapJson.site) {
    return { high: 0, medium: 0, low: 0, info: 0, alerts: [], found: false };
  }

  let high = 0;
  let medium = 0;
  let low = 0;
  let info = 0;
  const alertDetails = [];

  const sites = Array.isArray(zapJson.site) ? zapJson.site : [zapJson.site];
  for (const site of sites) {
    const alerts = site.alerts || [];
    for (const alert of alerts) {
      // riskcode: 0=Info, 1=Low, 2=Medium, 3=High
      const riskcode = parseInt(alert.riskcode, 10);
      const count = parseInt(alert.count, 10) || 1;

      if (riskcode === 3) high += count;
      else if (riskcode === 2) medium += count;
      else if (riskcode === 1) low += count;
      else info += count;

      alertDetails.push({
        name: alert.name || alert.alert,
        risk: alert.riskdesc || ["Info", "Low", "Medium", "High"][riskcode] || "Unknown",
        count: count,
        confidence: alert.confidence,
      });
    }
  }

  return {
    high,
    medium,
    low,
    info,
    total: high + medium + low + info,
    alerts: alertDetails,
    found: true,
  };
}

// --- Report generation ---

function generateReport(sourceFiles) {
  const timestamp = new Date().toISOString();
  const version = getPackageVersion();

  // Read all report files
  const npmAuditJson = readJsonFile(join(penetrationDir, "npm-audit.json"));
  const eslintText = readTextFile(join(penetrationDir, "eslint-security.txt"));
  const pa11yText = readTextFile(join(accessibilityDir, "pa11y-report.txt"));
  const axeJson = readJsonFile(join(accessibilityDir, "axe-results.json"));
  const axeWcag22Json = readJsonFile(join(accessibilityDir, "axe-wcag22-results.json"));
  const lighthouseJson = readJsonFile(join(accessibilityDir, "lighthouse-results.json"));
  const retireJson = readJsonFile(join(penetrationDir, "retire.json"));
  const zapJson = readJsonFile(join(penetrationDir, "zap-report.json"));

  // Parse all results
  const npmAudit = parseNpmAudit(npmAuditJson);
  const eslint = parseEslintSecurity(eslintText);
  const pa11y = parsePa11yReport(pa11yText);
  const axe = parseAxeResults(axeJson);
  const axeWcag22 = parseAxeResults(axeWcag22Json);
  const lighthouse = parseLighthouseResults(lighthouseJson);
  const retire = parseRetireResults(retireJson);
  const zap = parseZapResults(zapJson);

  // Build source files section
  const sourceFilesSection = sourceFiles
    .map((sf) => `  ${sf.exists ? "✅" : "❌"} ${sf.path}`)
    .join("\n");

  // Determine status
  const securityPass = npmAudit.critical === 0 && npmAudit.high === 0 && eslint.errors === 0 && zap.high === 0;
  const accessibilityPass = pa11y.failed === 0 && axe.violations === 0;
  const overallPass = securityPass && accessibilityPass;

  const statusIcon = (pass) => (pass ? "✅" : "❌");
  const statusText = (pass) => (pass ? "PASS" : "FAIL");

  // Generate markdown
  let report = `# Compliance Report

**Application**: DIY Accounting Submit
**Version**: ${version}
**Target URL**: ${targetUrl}
**Generated**: ${timestamp}
**Overall Status**: ${statusIcon(overallPass)} ${statusText(overallPass)}

**Source Files**:
\`\`\`
${sourceFilesSection}
\`\`\`

---

## Summary

| Check | Status | Summary |
|-------|--------|---------|
| npm audit | ${statusIcon(npmAudit.critical === 0 && npmAudit.high === 0)} | ${npmAudit.found ? `${npmAudit.critical} critical, ${npmAudit.high} high, ${npmAudit.moderate} moderate` : "Report not found"} |
| ESLint Security | ${statusIcon(eslint.errors === 0)} | ${eslint.found ? `${eslint.errors} errors, ${eslint.warnings} warnings` : "Report not found"} |
| retire.js | ${statusIcon(retire.high === 0)} | ${retire.found ? `${retire.high} high, ${retire.medium} medium, ${retire.low} low` : "Report not found"} |
| OWASP ZAP | ${statusIcon(zap.high === 0)} | ${zap.found ? `${zap.high} high, ${zap.medium} medium, ${zap.low} low` : "Report not found"} |
| Pa11y (WCAG AA) | ${statusIcon(pa11y.failed === 0)} | ${pa11y.found ? `${pa11y.passed}/${pa11y.total} pages passed` : "Report not found"} |
| axe-core | ${statusIcon(axe.violations === 0)} | ${axe.found ? `${axe.violations} violations, ${axe.passes} passes` : "Report not found"} |
| axe-core (WCAG 2.2) | ${statusIcon(axeWcag22.violations === 0)} | ${axeWcag22.found ? `${axeWcag22.violations} violations, ${axeWcag22.passes} passes` : "Report not found"} |
| Lighthouse | ${statusIcon(lighthouse.accessibility >= 90)} | ${lighthouse.found ? `A11y: ${lighthouse.accessibility}%, Perf: ${lighthouse.performance}%, BP: ${lighthouse.bestPractices}%` : "Report not found"} |

---

## 1. Security Checks

### 1.1 npm audit (Dependency Vulnerabilities)

${
  npmAudit.found
    ? `| Severity | Count |
|----------|-------|
| Critical | ${npmAudit.critical} |
| High | ${npmAudit.high} |
| Moderate | ${npmAudit.moderate} |
| Low | ${npmAudit.low} |
| **Total** | **${npmAudit.total}** |

**Status**: ${statusIcon(npmAudit.critical === 0 && npmAudit.high === 0)} ${npmAudit.critical === 0 && npmAudit.high === 0 ? "No critical/high vulnerabilities" : "Critical/high vulnerabilities require attention"}`
    : "⚠️ Report not found: `target/penetration/npm-audit.json`"
}

### 1.2 ESLint Security Analysis

${
  eslint.found
    ? `| Metric | Count |
|--------|-------|
| Errors | ${eslint.errors} |
| Warnings | ${eslint.warnings} |

**Status**: ${statusIcon(eslint.errors === 0)} ${eslint.errors === 0 ? "No security errors" : "Security errors require attention"}`
    : "⚠️ Report not found: `target/penetration/eslint-security.txt`"
}

### 1.3 retire.js (Known Vulnerabilities)

${
  retire.found
    ? `| Severity | Count |
|----------|-------|
| High | ${retire.high} |
| Medium | ${retire.medium} |
| Low | ${retire.low} |

**Status**: ${statusIcon(retire.high === 0)} ${retire.high === 0 ? "No high severity vulnerabilities" : "High severity vulnerabilities require attention"}`
    : "⚠️ Report not found: `target/penetration/retire.json`"
}

### 1.4 OWASP ZAP (Dynamic Security Scan)

${
  zap.found
    ? `| Risk Level | Count |
|------------|-------|
| High | ${zap.high} |
| Medium | ${zap.medium} |
| Low | ${zap.low} |
| Informational | ${zap.info} |

**Status**: ${statusIcon(zap.high === 0)} ${zap.high === 0 ? "No high risk vulnerabilities" : "High risk vulnerabilities require attention"}
${
  zap.alerts.length > 0
    ? `
#### Alerts

| Alert | Risk | Count |
|-------|------|-------|
${zap.alerts.map((a) => `| ${a.name} | ${a.risk} | ${a.count} |`).join("\n")}`
    : ""
}`
    : "⚠️ Report not found: `target/penetration/zap-report.json`"
}

---

## 2. Accessibility Checks

### 2.1 Pa11y (WCAG 2.1 Level AA)

${
  pa11y.found
    ? `| Metric | Value |
|--------|-------|
| Pages Tested | ${pa11y.total} |
| Pages Passed | ${pa11y.passed} |
| Pages Failed | ${pa11y.failed} |

**Status**: ${statusIcon(pa11y.failed === 0)} ${pa11y.failed === 0 ? "All pages comply with WCAG AA" : "Some pages have accessibility issues"}
${
  pa11y.results.length > 0
    ? `
#### Page Results

| Page | Errors |
|------|--------|
${pa11y.results.map((r) => `| ${r.url.replace(targetUrl, "") || "/"} | ${r.errorCount} |`).join("\n")}`
    : ""
}`
    : "⚠️ Report not found: `target/accessibility/pa11y-report.txt`"
}

### 2.2 axe-core (Automated Accessibility)

${
  axe.found
    ? `| Metric | Count |
|--------|-------|
| Violations | ${axe.violations} |
| Passes | ${axe.passes} |
| Incomplete | ${axe.incomplete} |

**Status**: ${statusIcon(axe.violations === 0)} ${axe.violations === 0 ? "No accessibility violations" : "Accessibility violations require attention"}
${
  axe.violationDetails.length > 0
    ? `
#### Violations

| Rule | Impact | Description | Nodes |
|------|--------|-------------|-------|
${axe.violationDetails.map((v) => `| ${v.id} | ${v.impact} | ${v.description} | ${v.nodes} |`).join("\n")}`
    : ""
}`
    : "⚠️ Report not found: `target/accessibility/axe-results.json`"
}

### 2.3 axe-core (WCAG 2.2 Level AA)

${
  axeWcag22.found
    ? `| Metric | Count |
|--------|-------|
| Violations | ${axeWcag22.violations} |
| Passes | ${axeWcag22.passes} |
| Incomplete | ${axeWcag22.incomplete} |

**Status**: ${statusIcon(axeWcag22.violations === 0)} ${axeWcag22.violations === 0 ? "No WCAG 2.2 violations" : "WCAG 2.2 violations detected"}
${
  axeWcag22.violationDetails.length > 0
    ? `
#### Violations

| Rule | Impact | Description | Nodes |
|------|--------|-------------|-------|
${axeWcag22.violationDetails.map((v) => `| ${v.id} | ${v.impact} | ${v.description} | ${v.nodes} |`).join("\n")}`
    : ""
}`
    : "⚠️ Report not found: `target/accessibility/axe-wcag22-results.json`"
}

### 2.4 Lighthouse

${
  lighthouse.found
    ? `| Category | Score |
|----------|-------|
| Accessibility | ${lighthouse.accessibility}% |
| Performance | ${lighthouse.performance}% |
| Best Practices | ${lighthouse.bestPractices}% |
| SEO | ${lighthouse.seo}% |

**Status**: ${statusIcon(lighthouse.accessibility >= 90)} ${lighthouse.accessibility >= 90 ? "Accessibility score meets threshold (90%+)" : "Accessibility score below 90% threshold"}`
    : "⚠️ Report not found: `target/accessibility/lighthouse-results.json`"
}

---

## 3. Report Files

| Report | Path | Status |
|--------|------|--------|
| npm audit | target/penetration/npm-audit.json | ${npmAudit.found ? "✅ Found" : "❌ Missing"} |
| ESLint Security | target/penetration/eslint-security.txt | ${eslint.found ? "✅ Found" : "❌ Missing"} |
| retire.js | target/penetration/retire.json | ${retire.found ? "✅ Found" : "❌ Missing"} |
| OWASP ZAP | target/penetration/zap-report.json | ${zap.found ? "✅ Found" : "❌ Missing"} |
| Pa11y | target/accessibility/pa11y-report.txt | ${pa11y.found ? "✅ Found" : "❌ Missing"} |
| axe-core | target/accessibility/axe-results.json | ${axe.found ? "✅ Found" : "❌ Missing"} |
| axe-core (WCAG 2.2) | target/accessibility/axe-wcag22-results.json | ${axeWcag22.found ? "✅ Found" : "❌ Missing"} |
| Lighthouse | target/accessibility/lighthouse-results.json | ${lighthouse.found ? "✅ Found" : "❌ Missing"} |

---

*Generated by \`node scripts/generate-compliance-report.js --target ${targetUrl}\`*
`;

  return report;
}

// --- Main ---

function main() {
  console.log("Compliance Report Generator");
  console.log("===========================");
  console.log(`Target: ${targetUrl}`);
  console.log(`Output: ${outputFile}`);
  console.log("");

  // Check for report files
  const reportFiles = [
    join(penetrationDir, "npm-audit.json"),
    join(penetrationDir, "eslint-security.txt"),
    join(penetrationDir, "retire.json"),
    join(penetrationDir, "zap-report.json"),
    join(accessibilityDir, "pa11y-report.txt"),
    join(accessibilityDir, "axe-results.json"),
    join(accessibilityDir, "axe-wcag22-results.json"),
    join(accessibilityDir, "lighthouse-results.json"),
  ];

  const sourceFiles = [];
  let foundCount = 0;
  for (const file of reportFiles) {
    const exists = existsSync(file);
    const relativePath = file.replace(projectRoot + "/", "");
    console.log(`  ${exists ? "✅" : "❌"} ${relativePath}`);
    sourceFiles.push({ path: relativePath, exists });
    if (exists) foundCount++;
  }
  console.log(`\nFound ${foundCount}/${reportFiles.length} report files.`);

  if (foundCount === 0) {
    console.error("\nError: No report files found. Run compliance tests first:");
    console.error("  npm run compliance:proxy-report");
    process.exit(1);
  }

  // Generate report
  console.log("\nGenerating compliance report...");
  const report = generateReport(sourceFiles);

  // Write report
  const outputPath = join(projectRoot, outputFile);
  writeFileSync(outputPath, report);
  console.log(`\nReport written to: ${outputPath}`);
}

main();
