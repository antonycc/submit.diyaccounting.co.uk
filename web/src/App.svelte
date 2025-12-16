<script>
  import Router from "svelte-spa-router";

  import Header from "./components/Header.svelte";
  import Footer from "./components/Footer.svelte";

  // Route components
  import Home from "./routes/Home.svelte";
  import Login from "./routes/Login.svelte";
  import LoginCallback from "./routes/LoginCallback.svelte";
  import Bundles from "./routes/Bundles.svelte";
  import VatObligations from "./routes/VatObligations.svelte";
  import SubmitVat from "./routes/SubmitVat.svelte";
  import ViewVatReturn from "./routes/ViewVatReturn.svelte";
  import Receipts from "./routes/Receipts.svelte";
  import About from "./routes/About.svelte";
  import Privacy from "./routes/Privacy.svelte";
  import UserGuide from "./routes/UserGuide.svelte";
  import NotFound from "./routes/NotFound.svelte";

  const routes = {
    "/": Home,
    "/auth/login": Login,
    "/auth/loginWithCognitoCallback": LoginCallback,
    "/auth/loginWithMockCallback": LoginCallback,
    "/account/bundles": Bundles,
    "/hmrc/vat/vatObligations": VatObligations,
    "/hmrc/vat/submitVat": SubmitVat,
    "/hmrc/vat/viewVatReturn": ViewVatReturn,
    "/hmrc/receipt/receipts": Receipts,
    "/about": About,
    "/privacy": Privacy,
    "/guide": UserGuide,
    "*": NotFound,
  };
</script>

<div class="app-container">
  <Header />

  <main id="mainContent">
    <Router {routes} />
  </main>

  <Footer />
</div>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
</style>
