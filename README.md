# Product Scout AI — MVP

Aplicație Next.js + TypeScript, mobile-first și instalabilă pe Android ca PWA. MVP-ul oferă:
- 10 idei de produse (ipoteze de cercetare, NU produse validate)
- linkuri de căutare eMAG, Trendyol, Alibaba
- filtre și căutare locală
- listă de favorite salvată în localStorage
- calculator de profit editabil
- export CSV
- pagină de metodologie și surse

## Ce NU face încă
- Nu scanează automat tot internetul.
- Nu are integrare API cu eMAG/Trendyol/Alibaba/Minea.
- Nu raportează afișări, vânzări ori volume de căutare inventate.
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
