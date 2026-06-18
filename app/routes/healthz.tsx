// Lightweight health check for the host (Render). Returns 200 with no auth.
export const loader = () => {
  return new Response("ok", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
};
