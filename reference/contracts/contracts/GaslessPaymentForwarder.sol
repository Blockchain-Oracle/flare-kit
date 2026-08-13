// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// OpenZeppelin: IERC20, SafeERC20, ECDSA, EIP712, Ownable, ReentrancyGuard
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Flare Contract Registry + AssetManager. ADAPTATION (flare-kit M9): the reference
// example imported from `/flare/` and used IFAsset, but on Coston2 the FXRP asset
// manager resolver `getAssetManagerFXRP()` lives in the `coston2/` periphery only
// (mainnet FXRP is not registered that way), and `IAssetManager.fAsset()` returns a
// plain OpenZeppelin `IERC20`. So we import from `coston2/` and type FXRP as IERC20.
// The forwarder still resolves FXRP from the on-chain registry at runtime, so the
// same deployed bytecode is network-agnostic.
import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {IAssetManager} from "@flarenetwork/flare-periphery-contracts/coston2/IAssetManager.sol";

/**
 * @title GaslessPaymentForwarder
 * @notice Enables gasless FXRP transfers using EIP-712 signed meta-transactions.
 * @dev Users sign payment requests off-chain, authorized relayers submit them
 *      on-chain and pay the gas. FXRP is resolved from the Flare Contract Registry
 *      (getAssetManagerFXRP() -> fAsset()), so no token address is hardcoded.
 *
 * Adapted from developer-hub/examples/developer-hub-solidity/GaslessPaymentForwarder.sol
 * (flare-kit M9, 2026-08-12). ADAPTATION: the reference example defined the
 * `authorizedRelayers` allowlist, the `setRelayerAuthorization` owner call and the
 * `UnauthorizedRelayer` error but never ENFORCED the allowlist in executePayment,
 * leaving it decorative. flare-kit's spec makes the allowlist load-bearing ("which
 * relayers may call executePayment"), so executePayment now reverts for an
 * unauthorized caller. This is the only behavioural change from the reference.
 *
 * Flow: (1) User approves this contract to spend FXRP once (the payer pays gas, once).
 *       (2) User signs a PaymentRequest off-chain (no gas). (3) An authorized relayer
 *       calls executePayment() and pays the gas. (4) The contract verifies the
 *       signature is the `from` account's, checks/increments the nonce, and pulls FXRP.
 */
contract GaslessPaymentForwarder is EIP712, Ownable, ReentrancyGuard {
    // 1. Define the necessary libraries and contract variables
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    mapping(address => uint256) public nonces; // replay protection per sender
    mapping(address => bool) public authorizedRelayers; // relayer allowlist

    // EIP-712 type hash for PaymentRequest
    bytes32 public constant PAYMENT_REQUEST_TYPEHASH =
        keccak256(
            "PaymentRequest(address from,address to,uint256 amount,uint256 nonce,uint256 deadline)"
        );

    // 2. Contract events
    event PaymentExecuted(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 nonce
    );
    event RelayerAuthorized(address indexed relayer, bool authorized); // relayer allowlist changed

    // 3. Custom errors
    error InvalidSignature(); // signer != from
    error ExpiredRequest(); // block.timestamp > deadline
    error InvalidNonce(); // nonce mismatch (replay)
    error UnauthorizedRelayer(); // caller not in allowlist
    error InsufficientAllowance(); // user approval < amount
    error ZeroAddress(); // zero address passed

    // 4. Constructor
    constructor() EIP712("GaslessPaymentForwarder", "1") Ownable(msg.sender) {}

    // 5. Returns FXRP token from Flare Contract Registry
    function fxrp() public view returns (IERC20) {
        IAssetManager assetManager = ContractRegistry.getAssetManagerFXRP();
        return assetManager.fAsset(); // FXRP token (IERC20) from registry
    }

    // 6. Execute a gasless payment
    function executePayment(
        address from,
        address to,
        uint256 amount,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        // ADAPTATION (flare-kit M9): enforce the relayer allowlist the reference
        // defined but never checked. Only an authorized relayer may submit.
        if (!authorizedRelayers[msg.sender]) revert UnauthorizedRelayer();

        if (block.timestamp > deadline) revert ExpiredRequest(); // validate deadline

        uint256 currentNonce = nonces[from];

        // 7. Hash the payment request
        bytes32 structHash = keccak256(
            abi.encode(
                PAYMENT_REQUEST_TYPEHASH,
                from,
                to,
                amount,
                currentNonce,
                deadline
            )
        );

        // 8. Recover the signer from the hash
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);

        // 9. Check if the signer is the from address
        if (signer != from) revert InvalidSignature();

        nonces[from] = currentNonce + 1; // increment nonce (prevents replay)

        IERC20 _fxrp = fxrp();

        // 10. Check if the allowance is sufficient
        if (_fxrp.allowance(from, address(this)) < amount) {
            revert InsufficientAllowance();
        }

        // 11. Transfer the amount to the recipient
        _fxrp.safeTransferFrom(from, to, amount);

        emit PaymentExecuted(from, to, amount, currentNonce); // log success
    }

    // 12. Views for off-chain signing / validation
    function getNonce(address account) external view returns (uint256) {
        return nonces[account]; // current nonce for off-chain signing
    }

    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4(); // EIP-712 domain separator
    }

    function getPaymentRequestHash(
        address from,
        address to,
        uint256 amount,
        uint256 nonce,
        uint256 deadline
    ) external view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                PAYMENT_REQUEST_TYPEHASH,
                from,
                to,
                amount,
                nonce,
                deadline
            )
        );
        return _hashTypedDataV4(structHash); // full EIP-712 typed-data hash
    }

    // 13. Owner: relayer allowlist
    function setRelayerAuthorization(
        address relayer,
        bool authorized
    ) external onlyOwner {
        authorizedRelayers[relayer] = authorized; // update allowlist
        emit RelayerAuthorized(relayer, authorized);
    }
}
