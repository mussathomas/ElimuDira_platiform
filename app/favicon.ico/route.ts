const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#176b5b"/><path d="M16 18h14c7 0 12 5 12 12v19H28c-7 0-12-5-12-12V18Z" fill="#f7f4ec"/><path d="M48 18H34c-7 0-12 5-12 12v19h14c7 0 12-5 12-12V18Z" fill="#d8eadf"/><path d="M32 25v24" stroke="#176b5b" stroke-width="3"/></svg>`;

export function GET() {
  return new Response(icon, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
