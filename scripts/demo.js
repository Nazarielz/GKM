
const { ethers } = require("hardhat");

async function main() {
  // 1. Menggunakan akun lokal Hardhat
  const [admin, creator] = await ethers.getSigners();

  // 2. Alamat smart contract hasil deployment
  const contractAddress =
    "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  const galeri = await ethers.getContractAt(
    "GaleriKarya",
    contractAddress
  );

  console.log("=== SIMULASI GALERI KARYA ===");
  console.log("Admin   :", admin.address);
  console.log("Creator :", creator.address);

  // 3. Data karya contoh
  const category = "Digital Art";

  // URI contoh untuk simulasi, belum merupakan file IPFS sungguhan
  const metadataURI = "ipfs://demo-karya-001/metadata.json";

  const contentHash = ethers.keccak256(
    ethers.toUtf8Bytes("karya-demo-001")
  );

  // 4. Creator mengajukan karya
  console.log("\n[1] Creator mengajukan karya...");

  const submitTx = await galeri
    .connect(creator)
    .submitArtwork(category, metadataURI, contentHash);

  const submitReceipt = await submitTx.wait();

  // Membaca ID karya dari event
  const event = submitReceipt.logs
    .map((log) => {
      try {
        return galeri.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((item) => item && item.name === "ArtworkSubmitted");

  const artworkId = event.args.artworkId;

  console.log("Artwork ID :", artworkId.toString());
  console.log("Gas Submit :", submitReceipt.gasUsed.toString());

  // 5. Admin/kurator menyetujui dan mint NFT
  console.log("\n[2] Kurator menyetujui karya...");

  const mintTx = await galeri
    .connect(admin)
    .approveAndMint(artworkId);

  const mintReceipt = await mintTx.wait();

  console.log("Gas Mint   :", mintReceipt.gasUsed.toString());

  // 6. Memeriksa pemilik NFT
  console.log("\n[3] Memeriksa NFT...");

  const owner = await galeri.ownerOf(artworkId);
  const tokenURI = await galeri.tokenURI(artworkId);
  const artwork = await galeri.getArtwork(artworkId);

  console.log("NFT Owner  :", owner);
  console.log("Token URI  :", tokenURI);
  console.log("Status     :", artwork.status.toString());
  console.log("Token ID   :", artwork.tokenId.toString());

  // 7. Ringkasan penggunaan gas
  console.log("\n=== HASIL SIMULASI ===");
  console.log(
    "Total Gas  :",
    (submitReceipt.gasUsed + mintReceipt.gasUsed).toString()
  );

  console.log("Simulasi berhasil!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
