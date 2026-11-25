
const { ethers } = require("hardhat");

async function main() {
  // Akun creator dari Hardhat Local
  const [admin, creator] = await ethers.getSigners();

  // Alamat smart contract hasil deployment
  const contractAddress =
    "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  // GANTI dengan metadata URI dari hasil upload Pinata
  const metadataURI = "ipfs://bafkreigg3ayx35ld2wqp3qq2oxvm2nvjwkdo2f5tzc5uy4dxpyatfhzelq";

  // GANTI dengan contentHash dari backend
  const contentHash = "0x8513a43cc58fbf91c286d0b3a06080238ed045d054bde8a52f07c316c56cd5f4";

  // Data karya
  const category = "Ilustrasi";

  // Validasi agar placeholder tidak ikut terkirim
  if (
    metadataURI.includes("GANTI") ||
    contentHash.includes("GANTI")
  ) {
    throw new Error("Isi metadataURI dan contentHash terlebih dahulu!");
  }

  if (!ethers.isHexString(contentHash, 32)) {
    throw new Error("contentHash harus berupa bytes32 yang valid!");
  }

  // Menghubungkan ke smart contract
  const galeri = await ethers.getContractAt(
    "GaleriKarya",
    contractAddress,
    creator
  );

  console.log("=== PENGAJUAN KARYA DARI IPFS ===");
  console.log("Creator :", creator.address);
  console.log("Admin   :", admin.address);
  console.log("Metadata:", metadataURI);
  console.log("Hash    :", contentHash);

  // Creator mengajukan karya
  console.log("\nMengirim transaksi ke blockchain...");

  const tx = await galeri.submitArtwork(
    category,
    metadataURI,
    contentHash
  );

  const receipt = await tx.wait();

  // Membaca event ArtworkSubmitted
  const event = receipt.logs
    .map((log) => {
      try {
        return galeri.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((item) => item && item.name === "ArtworkSubmitted");

  const artworkId = event.args.artworkId;

  // Memeriksa data yang tersimpan
  const artwork = await galeri.getArtwork(artworkId);

  console.log("\n=== PENGAJUAN BERHASIL ===");
  console.log("Artwork ID :", artworkId.toString());
  console.log("Creator    :", artwork.creator);
  console.log("Category   :", artwork.category);
  console.log("Metadata   :", artwork.metadataURI);
  console.log("Hash       :", artwork.contentHash);
  console.log("Status     :", artwork.status.toString());
  console.log("Gas Used   :", receipt.gasUsed.toString());
  console.log("Block      :", receipt.blockNumber);
}

main().catch((error) => {
  console.error("\nPengajuan gagal:", error);
  process.exitCode = 1;
});
