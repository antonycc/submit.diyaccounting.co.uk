// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

/**
 * Knowledge Base Page Controller
 *
 * Loads articles from TOML, handles search, accordion display,
 * and category filtering.
 */

class KnowledgeBasePage {
  constructor() {
    this.kbSearch = null;
    this.openArticleId = null;
    this.loadedArticles = {}; // Cache: id -> markdown content

    this.searchInput = document.getElementById("kb-search");
    this.searchHint = document.getElementById("search-hint");
    this.articleList = document.getElementById("article-list");
    this.categoryFilter = document.getElementById("category-filter");

    this.init();
  }

  async init() {
    try {
      const response = await fetch("knowledge-base.toml");
      if (!response.ok) {
        throw new Error("Failed to load knowledge base: " + response.status);
      }
      const tomlText = await response.text();
      const data = window.TomlParser.parse(tomlText);
      this.kbSearch = new window.KBSearch(data.article);

      // Populate category filter
      this.populateCategories();

      // Initial render
      this.render(this.kbSearch.search(""));
    } catch (error) {
      console.error("Error loading knowledge base:", error);
      this.articleList.innerHTML =
        '<div class="no-results"><p>Unable to load knowledge base. Please refresh the page.</p></div>';
      return;
    }

    // Search input handler
    var handleSearch = window.debounce(
      function (e) {
        var query = e.target.value;
        var category = this.categoryFilter ? this.categoryFilter.value : "";
        var results = this.kbSearch.search(query, category || undefined);
        this.render(results);
        this.updateHint(query, results.length);
      }.bind(this),
      150
    );

    this.searchInput.addEventListener("input", handleSearch);

    // Category filter handler
    if (this.categoryFilter) {
      this.categoryFilter.addEventListener(
        "change",
        function () {
          var query = this.searchInput.value;
          var category = this.categoryFilter.value;
          var results = this.kbSearch.search(query, category || undefined);
          this.render(results);
          this.updateHint(query, results.length);
        }.bind(this)
      );
    }
  }

  populateCategories() {
    if (!this.categoryFilter) return;
    var categories = this.kbSearch.getCategories();
    for (var i = 0; i < categories.length; i++) {
      var cat = categories[i];
      var option = document.createElement("option");
      option.value = cat.category;
      option.textContent =
        this.formatCategory(cat.category) + " (" + cat.count + ")";
      this.categoryFilter.appendChild(option);
    }
  }

  updateHint(query, count) {
    if (!this.searchHint) return;
    if (!query.trim()) {
      this.searchHint.textContent = "Showing featured articles";
    } else if (count === 0) {
      this.searchHint.textContent =
        "No matching articles \u2014 try different keywords";
    } else {
      this.searchHint.textContent =
        count + " result" + (count === 1 ? "" : "s");
    }
  }

  render(articles) {
    if (articles.length === 0) {
      this.articleList.innerHTML =
        '<div class="no-results">' +
        "<p>No articles match your search.</p>" +
        '<p>Try different keywords, or <button class="link-button" id="clear-search">view all articles</button></p>' +
        "</div>";
      var clearBtn = document.getElementById("clear-search");
      if (clearBtn) {
        clearBtn.addEventListener(
          "click",
          function () {
            this.searchInput.value = "";
            if (this.categoryFilter) this.categoryFilter.value = "";
            this.render(this.kbSearch.search(""));
            this.updateHint("", this.kbSearch.search("").length);
          }.bind(this)
        );
      }
      return;
    }

    var html = "";
    for (var i = 0; i < articles.length; i++) {
      var article = articles[i];
      html +=
        '<div class="kb-item" data-id="' +
        this.escapeAttr(article.id) +
        '">';
      html +=
        '<button class="kb-question" aria-expanded="false">' +
        '<span class="kb-category-badge">' +
        this.formatCategory(article.category) +
        "</span>" +
        '<span class="kb-question-text">' +
        this.escapeHtml(article.question) +
        "</span>" +
        '<svg class="kb-chevron" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M6 9l6 6 6-6"/>' +
        "</svg>" +
        "</button>";
      // Show short description; full content loaded on expand
      var desc = article.description
        ? "<p>" + this.escapeHtml(article.description) + "</p>"
        : '<p class="kb-loading">Loading article...</p>';
      html +=
        '<div class="kb-answer" hidden data-loaded="false">' + desc + "</div>";
      html += "</div>";
    }

    this.articleList.innerHTML = html;

    // Accordion click handlers
    var buttons = this.articleList.querySelectorAll(".kb-question");
    for (var j = 0; j < buttons.length; j++) {
      buttons[j].addEventListener("click", this.toggleArticle.bind(this));
    }
  }

  toggleArticle(event) {
    var button = event.currentTarget;
    var item = button.closest(".kb-item");
    var id = item.dataset.id;
    var answer = item.querySelector(".kb-answer");
    var isOpen = button.getAttribute("aria-expanded") === "true";

    // Close previously open item
    if (this.openArticleId && this.openArticleId !== id) {
      var prev = this.articleList.querySelector(
        '[data-id="' + this.openArticleId + '"]'
      );
      if (prev) {
        prev
          .querySelector(".kb-question")
          .setAttribute("aria-expanded", "false");
        prev.querySelector(".kb-answer").hidden = true;
      }
    }

    button.setAttribute("aria-expanded", !isOpen);
    answer.hidden = isOpen;
    this.openArticleId = isOpen ? null : id;

    // Lazy-load full article content on first expand
    if (!isOpen && answer.dataset.loaded === "false") {
      this.loadArticleContent(id, answer);
    }
  }

  loadArticleContent(id, answerEl) {
    // Check cache first
    if (this.loadedArticles[id]) {
      answerEl.innerHTML = this.renderMarkdown(this.loadedArticles[id]);
      answerEl.dataset.loaded = "true";
      return;
    }

    answerEl.innerHTML = '<p class="kb-loading">Loading article...</p>';

    fetch("articles/" + encodeURIComponent(id) + ".md")
      .then(
        function (response) {
          if (!response.ok) throw new Error("Not found");
          return response.text();
        }
      )
      .then(
        function (markdown) {
          this.loadedArticles[id] = markdown;
          answerEl.innerHTML = this.renderMarkdown(markdown);
          answerEl.dataset.loaded = "true";
        }.bind(this)
      )
      .catch(
        function () {
          answerEl.innerHTML =
            "<p>Unable to load article content. Please try again.</p>";
        }
      );
  }

  formatCategory(cat) {
    var labels = {
      bookkeeping: "Bookkeeping",
      "sole-trader": "Sole Trader",
      "company-accounts": "Company Accounts",
      "company-formation": "Company Formation",
      vat: "VAT",
      expenses: "Expenses & Allowances",
      payroll: "Payroll & PAYE",
      taxi: "Taxi Driver",
      "financial-planning": "Financial Planning",
      tax: "Tax",
      general: "General",
    };
    return labels[cat] || cat;
  }

  escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  escapeAttr(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  renderMarkdown(text) {
    var lines = text.trim().split("\n");
    var result = [];
    var inList = false;
    var listType = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // Numbered list
      if (/^\d+\.\s+/.test(line.trim())) {
        if (!inList || listType !== "ol") {
          if (inList) result.push("</" + listType + ">");
          inList = true;
          listType = "ol";
          result.push("<ol>");
        }
        var content = line.trim().replace(/^\d+\.\s+/, "");
        result.push("<li>" + this.renderInline(content) + "</li>");
        continue;
      }

      // Unordered list
      if (line.trim().indexOf("- ") === 0) {
        if (!inList || listType !== "ul") {
          if (inList) result.push("</" + listType + ">");
          inList = true;
          listType = "ul";
          result.push("<ul>");
        }
        var ulContent = line.trim().substring(2);
        result.push("<li>" + this.renderInline(ulContent) + "</li>");
        continue;
      }

      // End list if current line is not a list item
      if (inList && line.trim() !== "") {
        result.push("</" + listType + ">");
        inList = false;
        listType = null;
      }

      // Empty line
      if (line.trim() === "") {
        if (inList) {
          result.push("</" + listType + ">");
          inList = false;
          listType = null;
        }
        continue;
      }

      // Regular paragraph
      if (!inList) {
        result.push("<p>" + this.renderInline(line.trim()) + "</p>");
      }
    }

    if (inList) {
      result.push("</" + listType + ">");
    }

    return result.join("\n");
  }

  renderInline(text) {
    // Bold text: **text**
    var result = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Italic text: *text*
    result = result.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    // Markdown links: [text](url)
    var output = "";
    var i = 0;
    while (i < result.length) {
      if (result[i] === "[") {
        var closeBracket = result.indexOf("]", i + 1);
        if (closeBracket !== -1 && result[closeBracket + 1] === "(") {
          var closeParen = result.indexOf(")", closeBracket + 2);
          if (closeParen !== -1) {
            var linkText = result.slice(i + 1, closeBracket);
            var url = result.slice(closeBracket + 2, closeParen);
            output +=
              '<a href="' +
              url +
              '" target="_blank" rel="noopener">' +
              linkText +
              "</a>";
            i = closeParen + 1;
            continue;
          }
        }
      }
      output += result[i];
      i++;
    }
    return output;
  }
}

// Initialise on page load
if (document.getElementById("article-list")) {
  var kbPageInstance = new KnowledgeBasePage();
  window.kbPageInstance = kbPageInstance;
}
