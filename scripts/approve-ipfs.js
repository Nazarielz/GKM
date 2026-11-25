
const { ethers } = require("hardhat");

async function main() {
  // Akun lokal Hardhat
  const [admin, creator] = await ethers.getSigners();

  // Contract address hasil deployment
  const contractAddress =
    "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  // Artwork ID yang akan disetujui
  const artworkId = 2;

  // Hubungkan admin sebagai kurator
  const galeri = await ethers.getContractAt(
    "GaleriKarya",
    contractAddress,
    admin
  );

  console.log("=== PERSETUJUAN KURATOR ===");
  console.log("Kurator :", admin.address);

  // Periksa data pengajuan sebelum mint
  const before = await galeri.getArtwork(artworkId);

  console.log("Artwork ID :", artworkId);
  console.log("Creator    :", before.creator);
  console.log("Metadata   :", before.metadataURI);
  console.log("Status Awal:", before.status.toString());

  if (before.status !== 0n) {
    throw new Error("Karya tidak berstatus Pending!");
  }

  // Kurator menyetujui dan mencetak NFT
  console.log("\nKurator menyetujui karya...");

  const tx = await galeri.approveAndMint(artworkId);
  const receipt = await tx.wait();

  // Verifikasi hasil minting
  const after = await galeri.getArtwork(artworkId);
  const owner = await galeri.ownerOf(artworkId);
  const tokenURI = await galeri.tokenURI(artworkId);

  console.log("\n=== HASIL MINTING NFT ===");
  console.log("Artwork ID :", artworkId);
  console.log("Token ID   :", after.tokenId.toString());
  console.log("NFT Owner  :", owner);
  console.log("Creator    :", creator.address);
  console.log("Metadata   :", tokenURI);
  console.log("Status     :", after.status.toString());
  console.log("Gas Used   :", receipt.gasUsed.toString());
  console.log("Block      :", receipt.blockNumber);

  if (
    owner.toLowerCase() !== creator.address.toLowerCase()
  ) {
    throw new Error("Pemilik NFT tidak sesuai dengan creator!");
  }

  console.log("\nNFT berhasil diterbitkan!");
}

main().catch((error) => {
  console.error("\nPersetujuan gagal:", error);
  process.exitCode = 1;
});
