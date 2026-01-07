# Gov-Vendor-License-IDs

The Submit service is an open-source (AGPL-3.0) web application delivered as a SaaS.
It does not install licensed software on the client device, nor does it use
per-device or per-user vendor license keys.

In accordance with HMRC Fraud Prevention guidance, this header is omitted
because the data does not exist.

# Gov-Client-Public-Port

The Submit service is a browser-based web application delivered over HTTPS via
CloudFront and AWS load balancers. The client TCP source port is not exposed to
application code in the browser and is not forwarded through the CDN/load
balancer layer.

In accordance with HMRC Fraud Prevention guidance, this header is omitted
because the data cannot be collected.
