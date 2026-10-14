# Product Scout AI — MVP

Aplicație Next.js + TypeScript, mobile-first și instalabilă pe Android ca PWA. MVP-ul oferă:
- **Scanare live (stil X-Scan)**: scrii un cuvânt-cheie și aplicația citește în timp real prima pagină eMAG.ro sau Trendyol RO (până la 60 de produse): preț, preț vechi, rating, număr de recenzii, vânzător, poziție. Arată și prețul mediu, recenziile medii din top 10, dificultatea de intrare și vânzări/venit lunar **estimate din recenzii** (ipotezele se pot ajusta). Dacă scanezi același cuvânt din nou după câteva zile, vezi creșterea reală a recenziilor pentru fiecare produs.
- 10 idei de produse (ipoteze de cercetare, NU produse validate)
- linkuri de căutare eMAG, Trendyol, Alibaba
- filtre și căutare locală
- listă de favorite salvată în localStorage
- calculator de profit editabil
- export CSV
- pagină de metodologie și surse

## Ce NU face încă
- Nu are acces la vânzările reale: cifrele de vânzări sunt estimări din recenzii.
- Scanarea citește paginile publice de căutare. Dacă eMAG/Trendyol blochează serverul (captcha/403) sau își schimbă structura paginii, aplicația afișează un mesaj de eroare și linkul către căutare.
- Nu persistă datele între browsere/dispozitive; favoritele sunt locale.

## Cerințe
Node.js 20.9+ și npm.

## Pornire locală
```bash
npm install
npm run dev
```
Deschide http://localhost:3000.

## Instalare Android pentru test local
1. Telefonul și calculatorul trebuie să fie în aceeași rețea Wi-Fi.
2. Pornește serverul cu `npm run dev -- --hostname 0.0.0.0`.
3. Află IP-ul local al calculatorului și deschide `http://IP-UL-CALCULATORULUI:3000` în Chrome pe telefon.
4. Din meniul Chrome alege „Adaugă la ecranul de pornire” / „Instalează aplicația”.
Pentru utilizare fără rețeaua locală, publică proiectul pe un hosting HTTPS. PWA/manifest este inclus, dar cache offline avansat nu este implementat.

## Publicare gratuită (opțional)
Poți publica pe un plan gratuit compatibil cu Next.js (de ex. Vercel, în limitele planului și termenilor actuali). Ai nevoie de cont și internet. Gratuitatea și limitele pot fi schimbate de furnizor.

## Următoarea etapă: colectare de date reale
1. Alege surse și confirmă permisiunea/API-ul sau exportul disponibil.
2. Construiește adaptoare server-side pentru fiecare sursă.
3. Stochează observații cu timestamp, URL, câmpuri colectate și proveniență.
4. Separă câmpurile observate de cele estimate.
5. Calibrează scorurile doar după ce avem date istorice și rezultate reale.

## Dacă scanarea dă „HTTP 403” (blocat)
eMAG/Trendyol pot bloca serverele de hosting (de ex. Vercel). Aplicația poate trece prin [ScraperAPI](https://www.scraperapi.com/), care folosește IP-uri rezidențiale:
1. Creează un cont pe scraperapi.com și copiază **API Key** din dashboard.
2. În Vercel: proiectul → **Settings → Environment Variables** → adaugă `SCRAPERAPI_KEY` cu valoarea cheii → Save.
3. **Deployments** → ultimul deployment → **Redeploy**.

Aplicația încearcă întâi direct (gratuit); doar dacă e blocată folosește ScraperAPI, apoi, dacă tot e blocată, varianta premium a ScraperAPI (consumă mai multe credite).
