// src/lib/buildOAuthOutboundRedirectUrl.js

export default function buildOAuthOutboundRedirectUrl(state) {
    const clientId = process.env.DIY_SUBMIT_HMRC_CLIENT_ID;
    const redirectUri = process.env.DIY_SUBMIT_HOME_URL;
    const hmrcBase = process.env.DIY_SUBMIT_HMRC_BASE_URI;
    const scope = "write:vat read:vat";
    return `${hmrcBase}/oauth/authorize?response_type=code` +
        `&client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&state=${encodeURIComponent(state)}`;
}