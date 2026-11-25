
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GaleriKarya Smart Contract", function () {
  let galeri;
  let admin;
  let creator;
  let curator;
  let stranger;

  const CATEGORY = "Fotografi";
  const METADATA_URI = "ipfs://QmExampleMetadata123";
  
  let CONTENT_HASH;

  beforeEach(async function () {
    [admin, creator, curator, stranger] =
      await ethers.getSigners();

    CONTENT_HASH = ethers.keccak256(
      ethers.toUtf8Bytes("karya-fotografi-001")
    );

    const GaleriKarya = await ethers.getContractFactory(
      "GaleriKarya"
    );

    galeri = await GaleriKarya.deploy(admin.address);

    await galeri.waitForDeployment();

    // Memberikan hak akses kurator
    const curatorRole = await galeri.CURATOR_ROLE();

    await galeri.grantRole(curatorRole, curator.address);
  });

  // 1. Pengujian deployment
  describe("Deployment", function () {
    it("Harus memiliki nama dan simbol NFT yang benar", async function () {
      expect(await galeri.name()).to.equal(
        "Galeri Karya Multimedia"
      );

      expect(await galeri.symbol()).to.equal("GKM");
    });

    it("Admin harus memiliki hak akses admin dan kurator", async function () {
      const adminRole = await galeri.DEFAULT_ADMIN_ROLE();
      const curatorRole = await galeri.CURATOR_ROLE();

      expect(
        await galeri.hasRole(adminRole, admin.address)
      ).to.equal(true);

      expect(
        await galeri.hasRole(curatorRole, admin.address)
      ).to.equal(true);
    });

    it("Tidak boleh deploy dengan alamat admin kosong", async function () {
      const GaleriKarya = await ethers.getContractFactory(
        "GaleriKarya"
      );

      await expect(
        GaleriKarya.deploy(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(
        GaleriKarya,
        "ZeroAddress"
      );
    });
  });

  // 2. Pengujian pengajuan karya
  describe("Submit Artwork", function () {
    it("Creator dapat mengajukan karya", async function () {
      await expect(
        galeri.connect(creator).submitArtwork(
          CATEGORY,
          METADATA_URI,
          CONTENT_HASH
        )
      )
        .to.emit(galeri, "ArtworkSubmitted")
        .withArgs(
          1,
          creator.address,
          CATEGORY,
          METADATA_URI,
          CONTENT_HASH
        );

      const artwork = await galeri.getArtwork(1);

      expect(artwork.creator).to.equal(creator.address);
      expect(artwork.category).to.equal(CATEGORY);
      expect(artwork.contentHash).to.equal(CONTENT_HASH);
      expect(artwork.metadataURI).to.equal(METADATA_URI);
      expect(artwork.status).to.equal(0);
    });

    it("Tidak boleh mengajukan kategori kosong", async function () {
      await expect(
        galeri.connect(creator).submitArtwork(
          "",
          METADATA_URI,
          CONTENT_HASH
        )
      ).to.be.revertedWithCustomError(
        galeri,
        "EmptyCategory"
      );
    });

    it("Tidak boleh menggunakan URI selain IPFS", async function () {
      await expect(
        galeri.connect(creator).submitArtwork(
          CATEGORY,
          "https://example.com/metadata.json",
          CONTENT_HASH
        )
      ).to.be.revertedWithCustomError(
        galeri,
        "InvalidMetadataURI"
      );
    });

    it("Tidak boleh menggunakan content hash kosong", async function () {
      await expect(
        galeri.connect(creator).submitArtwork(
          CATEGORY,
          METADATA_URI,
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(
        galeri,
        "EmptyContentHash"
      );
    });

    it("Tidak boleh mengajukan hash karya yang sama dua kali", async function () {
      await galeri.connect(creator).submitArtwork(
        CATEGORY,
        METADATA_URI,
        CONTENT_HASH
      );

      await expect(
        galeri.connect(stranger).submitArtwork(
          CATEGORY,
          METADATA_URI,
          CONTENT_HASH
        )
      ).to.be.revertedWithCustomError(
        galeri,
        "DuplicateContentHash"
      );
    });
  });

  // 3. Pengujian persetujuan dan mint NFT
  describe("Approve and Mint", function () {
    it("Kurator dapat menyetujui karya dan mencetak NFT", async function () {
      await galeri.connect(creator).submitArtwork(
        CATEGORY,
        METADATA_URI,
        CONTENT_HASH
      );

      await expect(
        galeri.connect(curator).approveAndMint(1)
      )
        .to.emit(galeri, "ArtworkMinted")
        .withArgs(
          1,
          1,
          creator.address,
          curator.address
        );

      expect(await galeri.ownerOf(1)).to.equal(
        creator.address
      );

      expect(await galeri.tokenURI(1)).to.equal(
        METADATA_URI
      );

      const artwork = await galeri.getArtwork(1);

      expect(artwork.status).to.equal(1);
      expect(artwork.tokenId).to.equal(1);
    });

    it("Creator tidak boleh menyetujui dan mint NFT sendiri", async function () {
      await galeri.connect(creator).submitArtwork(
        CATEGORY,
        METADATA_URI,
        CONTENT_HASH
      );

      await expect(
        galeri.connect(creator).approveAndMint(1)
      ).to.be.revertedWithCustomError(
        galeri,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("Tidak boleh mint karya yang belum diajukan", async function () {
      await expect(
        galeri.connect(curator).approveAndMint(1)
      ).to.be.revertedWithCustomError(
        galeri,
        "ArtworkNotFound"
      );
    });

    it("Tidak boleh mint karya yang sudah pernah di-mint", async function () {
      await galeri.connect(creator).submitArtwork(
        CATEGORY,
        METADATA_URI,
        CONTENT_HASH
      );

      await galeri.connect(curator).approveAndMint(1);

      await expect(
        galeri.connect(curator).approveAndMint(1)
      ).to.be.revertedWithCustomError(
        galeri,
        "ArtworkNotPending"
      );
    });
  });

  // 4. Pengujian penolakan karya
  describe("Reject Artwork", function () {
    it("Kurator dapat menolak pengajuan karya", async function () {
      await galeri.connect(creator).submitArtwork(
        CATEGORY,
        METADATA_URI,
        CONTENT_HASH
      );

      const reason = "Kualitas gambar tidak memenuhi standar";

      await expect(
        galeri.connect(curator).rejectArtwork(1, reason)
      )
        .to.emit(galeri, "ArtworkRejected")
        .withArgs(1, curator.address, reason);

      const artwork = await galeri.getArtwork(1);

      expect(artwork.status).to.equal(2);
      expect(artwork.rejectionReason).to.equal(reason);
    });

    it("Tidak boleh menolak karya dengan alasan kosong", async function () {
      await galeri.connect(creator).submitArtwork(
        CATEGORY,
        METADATA_URI,
        CONTENT_HASH
      );

      await expect(
        galeri.connect(curator).rejectArtwork(1, "")
      ).to.be.revertedWithCustomError(
        galeri,
        "EmptyRejectionReason"
      );
    });

    it("Creator tidak boleh menolak karya", async function () {
      await galeri.connect(creator).submitArtwork(
        CATEGORY,
        METADATA_URI,
        CONTENT_HASH
      );

      await expect(
        galeri.connect(creator).rejectArtwork(
          1,
          "Ditolak"
        )
      ).to.be.revertedWithCustomError(
        galeri,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("Karya yang ditolak tidak boleh di-mint", async function () {
      await galeri.connect(creator).submitArtwork(
        CATEGORY,
        METADATA_URI,
        CONTENT_HASH
      );

      await galeri.connect(curator).rejectArtwork(
        1,
        "Tidak memenuhi standar"
      );

      await expect(
        galeri.connect(curator).approveAndMint(1)
      ).to.be.revertedWithCustomError(
        galeri,
        "ArtworkNotPending"
      );
    });
  });

  // 5. Pengujian hak akses
  describe("Access Control", function () {
    it("Admin dapat memberikan hak akses kurator", async function () {
      const curatorRole = await galeri.CURATOR_ROLE();

      await galeri.grantRole(
        curatorRole,
        stranger.address
      );

      expect(
        await galeri.hasRole(curatorRole, stranger.address)
      ).to.equal(true);
    });

    it("Orang tanpa hak admin tidak boleh memberikan role", async function () {
      const curatorRole = await galeri.CURATOR_ROLE();

      await expect(
        galeri.connect(stranger).grantRole(
          curatorRole,
          stranger.address
        )
      ).to.be.revertedWithCustomError(
        galeri,
        "AccessControlUnauthorizedAccount"
      );
    });
  });

  // 6. Pengujian informasi karya
  describe("Artwork Information", function () {
    it("Tidak boleh mengambil informasi karya yang tidak ada", async function () {
      await expect(
        galeri.getArtwork(999)
      ).to.be.revertedWithCustomError(
        galeri,
        "ArtworkNotFound"
      );
    });

    it("ID karya berikutnya harus bertambah", async function () {
      await galeri.connect(creator).submitArtwork(
        CATEGORY,
        METADATA_URI,
        CONTENT_HASH
      );

      expect(await galeri.nextArtworkId()).to.equal(2);
    });
  });
});
