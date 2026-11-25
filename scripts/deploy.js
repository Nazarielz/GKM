
const { ethers } = require("hardhat");

async function main() {
  const [admin] = await ethers.getSigners();

  console.log("Memulai deployment GaleriKarya...");
  console.log("Admin:", admin.address);

  const GaleriKarya = await ethers.getContractFactory(
    "GaleriKarya"
  );

  const galeri = await GaleriKarya.deploy(admin.address);

  const deploymentReceipt = await galeri.deploymentTransaction().wait();

  await galeri.waitForDeployment();

  const contractAddress = await galeri.getAddress();

  console.log("\nDeployment berhasil!");
  console.log("Nama NFT:", await galeri.name());
  console.log("Simbol NFT:", await galeri.symbol());
  console.log("Contract Address:", contractAddress);
  console.log("Admin Address:", admin.address);
  console.log("Gas Used:", deploymentReceipt.gasUsed.toString());
  console.log("Block Number:", deploymentReceipt.blockNumber);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
