# Arsitektur
1. Kreator mengunggah karya melalui frontend.
2. FastAPI melakukan praproses dan inferensi.
3. Kreator meninjau/mengoreksi hasil AI.
4. Frontend mengunggah media dan metadata final ke IPFS.
5. Kreator mengajukan karya melalui MetaMask.
6. Kurator menyetujui dan menerbitkan NFT melalui MetaMask.
7. Galeri membaca kontrak dan IPFS untuk verifikasi.

Backend AI tidak menandatangani transaksi. Peran kurator ditegakkan di kontrak. AI hanya memberi saran.
