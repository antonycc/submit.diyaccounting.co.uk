(async function () {
  const url = "/api/v1/cognito/token";
  try {
    const response = await fetch(url, { method: "HEAD" });
    console.log(`HEAD ${url} -> ${response.status} ${response.statusText}`);
  } catch (err) {
    console.error(`Error performing HEAD ${url}:`, err);
  }
})();
