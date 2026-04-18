
User wants step-by-step guidance to register movies manually via admin panel by pasting a URL (likely from Telegram) and have it appear automatically on the home page.

Current flow already supports this — the admin panel exists at `/admin`, the `useMovies` hook fetches published movies, and the home page shows them automatically. No code changes needed, just guidance.

Key flow to explain:
1. Login → /admin
2. Click "Filmes" in sidebar
3. "Novo Filme" → fill title, paste video URL, upload cover
4. Set status = "Publicado"
5. Save → appears on home automatically
