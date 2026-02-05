/* recently-updated-page.js — Renders the recently updated articles list */
(function () {
  "use strict";

  var container = document.getElementById("recently-updated-list");
  if (!container) return;

  // Load both TOML files: recently-updated for the list, knowledge-base for titles
  Promise.all([
    fetch("recently-updated.toml").then(function (r) { return r.text(); }),
    fetch("knowledge-base.toml").then(function (r) { return r.text(); })
  ])
    .then(function (results) {
      var recentData = TomlParser.parse(results[0]);
      var kbData = TomlParser.parse(results[1]);

      // Build article title lookup from knowledge-base.toml
      var titleMap = {};
      var articles = kbData.article || [];
      articles.forEach(function (a) {
        if (a.id) titleMap[a.id] = a.title || a.id;
      });

      var entries = recentData.entry || [];
      if (entries.length === 0) {
        container.innerHTML = "<p>No recently updated articles.</p>";
        return;
      }

      // Sort by updated date descending (newest first)
      entries.sort(function (a, b) {
        return new Date(b.updated) - new Date(a.updated);
      });

      var html = "";
      entries.forEach(function (entry) {
        var slug = entry.article;
        var title = titleMap[slug] || slug.replace(/-/g, " ");
        var date = new Date(entry.updated);
        var dateStr = date.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric"
        });
        var timeStr = date.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit"
        });

        html += '<div class="kb-item recently-updated-item">';
        html += '<a href="articles/' + slug + '.html" class="kb-item-link">';
        html += '<span class="kb-item-title">' + title + '</span>';
        html += '<span class="recently-updated-date">' + dateStr + ' at ' + timeStr + '</span>';
        html += '</a>';
        html += '</div>';
      });

      container.innerHTML = html;
    })
    .catch(function (err) {
      console.error("Failed to load recently updated data:", err);
      container.innerHTML = "<p>Unable to load recently updated articles.</p>";
    });
})();
