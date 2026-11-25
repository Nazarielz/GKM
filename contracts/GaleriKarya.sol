
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract GaleriKarya is ERC721URIStorage, AccessControl {

    // Hak akses khusus
    bytes32 public constant CREATOR_ROLE =
        keccak256("CREATOR_ROLE");

    bytes32 public constant CURATOR_ROLE =
        keccak256("CURATOR_ROLE");

    // Status pengajuan karya
    enum ArtworkStatus {
        Pending,
        Minted,
        Rejected
    }

    // Struktur data karya
    struct Artwork {
        address creator;
        string category;
        bytes32 contentHash;
        string metadataURI;
        ArtworkStatus status;
        uint256 tokenId;
        string rejectionReason;
    }

    uint256 public nextArtworkId = 1;

    mapping(uint256 => Artwork) private artworks;

    mapping(bytes32 => bool) public contentHashUsed;

    // Events
    event ArtworkSubmitted(
        uint256 indexed artworkId,
        address indexed creator,
        string category,
        string metadataURI,
        bytes32 contentHash
    );

    event ArtworkMinted(
        uint256 indexed artworkId,
        uint256 indexed tokenId,
        address indexed creator,
        address curator
    );

    event ArtworkRejected(
        uint256 indexed artworkId,
        address indexed curator,
        string reason
    );

    // Custom errors
    error ZeroAddress();
    error EmptyCategory();
    error InvalidMetadataURI();
    error EmptyContentHash();
    error DuplicateContentHash(bytes32 contentHash);
    error ArtworkNotFound(uint256 artworkId);
    error ArtworkNotPending(uint256 artworkId);
    error EmptyRejectionReason();

    // Constructor
    constructor(address initialAdmin)
        ERC721("Galeri Karya Multimedia", "GKM")
    {
        if (initialAdmin == address(0)) {
            revert ZeroAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(CURATOR_ROLE, initialAdmin);
    }

    // ADMIN: Memberikan hak akses kreator
    // Menggunakan grantRole() bawaan AccessControl.
    // Hanya DEFAULT_ADMIN_ROLE yang dapat melakukannya.

    // CREATOR: Mengajukan karya
    function submitArtwork(
        string calldata category,
        string calldata metadataURI,
        bytes32 contentHash
    )
        external
        onlyRole(CREATOR_ROLE)
        returns (uint256 artworkId)
    {
        if (bytes(category).length == 0) {
            revert EmptyCategory();
        }

        if (!_hasIpfsPrefix(metadataURI)) {
            revert InvalidMetadataURI();
        }

        if (contentHash == bytes32(0)) {
            revert EmptyContentHash();
        }

        if (contentHashUsed[contentHash]) {
            revert DuplicateContentHash(contentHash);
        }

        artworkId = nextArtworkId++;

        artworks[artworkId] = Artwork({
            creator: msg.sender,
            category: category,
            contentHash: contentHash,
            metadataURI: metadataURI,
            status: ArtworkStatus.Pending,
            tokenId: 0,
            rejectionReason: ""
        });

        contentHashUsed[contentHash] = true;

        emit ArtworkSubmitted(
            artworkId,
            msg.sender,
            category,
            metadataURI,
            contentHash
        );
    }

    // CURATOR: Menyetujui karya dan mencetak NFT
    function approveAndMint(uint256 artworkId)
        external
        onlyRole(CURATOR_ROLE)
        returns (uint256 tokenId)
    {
        Artwork storage artwork = _getPendingArtwork(artworkId);

        tokenId = artworkId;

        artwork.status = ArtworkStatus.Minted;
        artwork.tokenId = tokenId;

        _safeMint(artwork.creator, tokenId);
        _setTokenURI(tokenId, artwork.metadataURI);

        emit ArtworkMinted(
            artworkId,
            tokenId,
            artwork.creator,
            msg.sender
        );
    }

    // CURATOR: Menolak pengajuan karya
    function rejectArtwork(
        uint256 artworkId,
        string calldata reason
    ) external onlyRole(CURATOR_ROLE) {

        if (bytes(reason).length == 0) {
            revert EmptyRejectionReason();
        }

        Artwork storage artwork = _getPendingArtwork(artworkId);

        artwork.status = ArtworkStatus.Rejected;
        artwork.rejectionReason = reason;

        emit ArtworkRejected(
            artworkId,
            msg.sender,
            reason
        );
    }

    // Mengambil informasi karya
    function getArtwork(uint256 artworkId)
        external
        view
        returns (Artwork memory)
    {
        if (artworkId == 0 || artworkId >= nextArtworkId) {
            revert ArtworkNotFound(artworkId);
        }

        return artworks[artworkId];
    }

    // Memastikan karya masih Pending
    function _getPendingArtwork(uint256 artworkId)
        private
        view
        returns (Artwork storage artwork)
    {
        if (artworkId == 0 || artworkId >= nextArtworkId) {
            revert ArtworkNotFound(artworkId);
        }

        artwork = artworks[artworkId];

        if (artwork.status != ArtworkStatus.Pending) {
            revert ArtworkNotPending(artworkId);
        }
    }

    // Memvalidasi prefix IPFS
    function _hasIpfsPrefix(string calldata uri)
        private
        pure
        returns (bool)
    {
        bytes memory value = bytes(uri);
        bytes memory prefix = bytes("ipfs://");

        if (value.length <= prefix.length) {
            return false;
        }

        for (uint256 i = 0; i < prefix.length; i++) {
            if (value[i] != prefix[i]) {
                return false;
            }
        }

        return true;
    }

    // Dukungan interface ERC721 dan AccessControl
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
