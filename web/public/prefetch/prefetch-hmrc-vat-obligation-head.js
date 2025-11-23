(async function () {
  const url = "/api/v1/hmrc/vat/obligation";
  try {
    // HMRC obligation endpoint uses custom authorizer with Cognito access token in X-Authorization
    const headers = {};
    try {
      const accessToken = localStorage.getItem("cognitoAccessToken");
      if (accessToken) headers["X-Authorization"] = `Bearer ${accessToken}`;
    } catch {}
    const response = await fetch(url, { method: "HEAD", headers });
    console.log(`HEAD ${url} -> ${response.status} ${response.statusText}`);
  } catch (err) {
    console.error(`Error performing HEAD ${url}:`, err);
  }
})();
