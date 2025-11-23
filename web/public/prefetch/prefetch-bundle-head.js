(async function () {
  const url = "/api/v1/bundle";
  try {
    const headers = {};
    try {
      const idToken = localStorage.getItem("cognitoIdToken");
      if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
    } catch {}
    const response = await fetch(url, { method: "HEAD", headers });
    console.log(`HEAD ${url} -> ${response.status} ${response.statusText}`);
  } catch (err) {
    console.error(`Error performing HEAD ${url}:`, err);
  }
})();
