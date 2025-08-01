// Generic utility functions for submit application

// Status message handling
function showStatus(message, type = "info") {
  console.log('Status message:', message, 'Type:', type);
  const statusMessagesContainer = document.getElementById("statusMessagesContainer");
  const msgDiv = document.createElement("div");
  msgDiv.className = `status-message status-${type}`;
  
  // Create message content container
  const messageContent = document.createElement("span");
  messageContent.textContent = message;
  messageContent.className = "status-message-content";
  
  // Create close button
  const closeButton = document.createElement("button");
  closeButton.textContent = "×";
  closeButton.className = "status-close-button";
  closeButton.setAttribute("aria-label", "Close message");
  closeButton.addEventListener("click", () => {
    removeStatusMessage(msgDiv);
  });
  
  // Append content and close button to message div
  msgDiv.appendChild(messageContent);
  msgDiv.appendChild(closeButton);
  statusMessagesContainer.appendChild(msgDiv);

  // Auto-hide info messages after 30 seconds
  if (type === "info") {
    setTimeout(() => {
      removeStatusMessage(msgDiv);
    }, 30000);
  }
}

function removeStatusMessage(msgDiv) {
  if (msgDiv && msgDiv.parentNode) {
    msgDiv.remove();
  }
}

function hideStatus() {
  console.log('Hiding all status messages');
  const statusMessagesContainer = document.getElementById("statusMessagesContainer");
  statusMessagesContainer.innerHTML = "";
}

// Loading state management
function showLoading() {
  console.log('Page display transition: Showing loading spinner');
  const loadingSpinner = document.getElementById("loadingSpinner");
  const submitBtn = document.getElementById("submitBtn");
  console.log('Loading spinner element:', loadingSpinner);
  if (loadingSpinner) {
    loadingSpinner.style.display = "block";
    loadingSpinner.style.visibility = "visible";
    loadingSpinner.style.opacity = "1";
    loadingSpinner.style.width = "40px";
    loadingSpinner.style.height = "40px";
    console.log('Loading spinner styles set:', loadingSpinner.style.cssText);
  }
  if (submitBtn) {
    submitBtn.disabled = true;
  }
}

function hideLoading() {
  console.log('Page display transition: Hiding loading spinner');
  const loadingSpinner = document.getElementById("loadingSpinner");
  const submitBtn = document.getElementById("submitBtn");
  loadingSpinner.style.display = "none";
  submitBtn.disabled = false;
}

// Utility functions
function generateRandomState() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Auth API functions
async function getAuthUrl(state) {
  const url = `/api/auth-url?state=${encodeURIComponent(state)}`;
  console.log(`Getting auth URL. Remote call initiated: GET ${url}`);

  const response = await fetch(url);
  const responseJson = await response.json();
  if (!response.ok) {
    const message = `Failed to get auth URL. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
  }

  console.log(`Got auth URL. Remote call completed successfully: GET ${url}`, responseJson);
  return responseJson;
}

async function exchangeToken(code) {
  const url = `/api/exchange-token`;
  const body = JSON.stringify({ code });
  console.log(`Exchanging token. Remote call initiated: POST ${url} ++ Body: ${body}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });
  if (!response.ok) {
    const message = `Failed to exchange token. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText}`;
    console.error(message);
    throw new Error(message);
  }

  const responseJson = await response.json();
  const hmrcAccessToken = responseJson.hmrcAccessToken;
  if (!hmrcAccessToken) {
    const message = `Failed to exchange token. Remote call response did not include hmrcAccessToken: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
  }

  console.log(`Exchanged token. Remote call completed successfully: POST ${url}`, responseJson, hmrcAccessToken);
  return hmrcAccessToken;
}

// Enhanced IP detection function with multiple fallback methods
async function getClientIP() {
  // Method 1: Try WebRTC-based IP detection (works for local IPs, limited for public IPs in modern browsers)
  const webRTCIP = await getIPViaWebRTC().catch(() => null);
  if (webRTCIP && !webRTCIP.startsWith('192.168.') && !webRTCIP.startsWith('10.') && !webRTCIP.startsWith('172.')) {
    return webRTCIP;
  }

  // Method 2: Try multiple IP detection services with timeout
  const ipServices = [
    'https://api.ipify.org',
    'https://ipapi.co/ip',
    'https://httpbin.org/ip'
  ];

  for (const service of ipServices) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
      
      let response;
      if (service === 'https://httpbin.org/ip') {
        response = await fetch(service, { signal: controller.signal });
        const data = await response.json();
        clearTimeout(timeoutId);
        return data.origin.split(',')[0].trim(); // httpbin returns "ip, ip" format sometimes
      } else {
        response = await fetch(service, { signal: controller.signal });
        const ip = await response.text();
        clearTimeout(timeoutId);
        return ip.trim();
      }
    } catch (error) {
      console.warn(`Failed to get IP from ${service}:`, error.message);
      continue;
    }
  }

  // Method 3: Fallback - let server detect IP from request headers
  console.warn('All IP detection methods failed, server will detect IP from request headers');
  return 'SERVER_DETECT';
}

// WebRTC-based IP detection (limited effectiveness in modern browsers due to security restrictions)
function getIPViaWebRTC() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebRTC timeout')), 2000);
    
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      pc.createDataChannel('');
      pc.createOffer().then(offer => pc.setLocalDescription(offer));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          const ipMatch = candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (ipMatch) {
            clearTimeout(timeout);
            pc.close();
            resolve(ipMatch[1]);
          }
        }
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          pc.close();
          reject(new Error('No IP found via WebRTC'));
        }
      };
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

// OAuth callback handling
function handleOAuth(callback) {
  console.log('OAuth callback handler');
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  const state = urlParams.get("state");
  const error = urlParams.get("error");

  if (error) {
    showStatus(`OAuth error: ${error}`, "error");
    console.error('OAuth callback handler (error exit)');
    return;
  }

  if (code && state) {
    const storedState = sessionStorage.getItem("oauth_state");
    const storedSubmissionData = sessionStorage.getItem("submission_data");

    if (state !== storedState) {
      showStatus("Invalid OAuth state. Please try again.", "error");
      console.error('OAuth callback handler (invalid state exit)');
      return;
    }

    if (!storedSubmissionData) {
      showStatus("Submission data not found. Please try again.", "error");
      console.error('OAuth callback handler (missing data exit)');
      return;
    }

    // Clear URL parameters
    console.log('Page transition initiated: Clearing URL parameters');
    window.history.replaceState({}, document.title, window.location.pathname);

    // Continue with token exchange and submission
    callback(code, JSON.parse(storedSubmissionData));
    console.log('OAuth callback handler (normal completion)');
  }
  console.log('OAuth callback handler (no action taken)');
}


// Expose functions to window for use by other scripts and testing
if (typeof window !== 'undefined') {
  window.showStatus = showStatus;
  window.hideStatus = hideStatus;
  window.removeStatusMessage = removeStatusMessage;
  window.showLoading = showLoading;
  window.hideLoading = hideLoading;
  window.generateRandomState = generateRandomState;
  window.getAuthUrl = getAuthUrl;
  window.exchangeToken = exchangeToken;
  window.getClientIP = getClientIP;
  window.getIPViaWebRTC = getIPViaWebRTC;
  window.handleOAuth = handleOAuth;
}