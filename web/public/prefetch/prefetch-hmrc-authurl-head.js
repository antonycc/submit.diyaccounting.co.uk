(async function () {
  const url = "/api/v1/hmrc/authUrl";
  try {
    const response = await fetch(url, { method: "HEAD" });
    console.log(`HEAD ${url} -> ${response.status} ${response.statusText}`);
  } catch (err) {
    console.error(`Error performing HEAD ${url}:`, err);
  }
})();
