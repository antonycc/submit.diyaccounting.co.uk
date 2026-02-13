// session-beacon.js — fire-and-forget session start beacon
(function () {
  if (typeof sessionStorage === "undefined") return;
  if (sessionStorage.getItem("__diy_session__")) return;
  sessionStorage.setItem("__diy_session__", "1");

  try {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/session/beacon", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify({ page: window.location.pathname }));
  } catch (e) {
    // fire-and-forget
  }
})();
