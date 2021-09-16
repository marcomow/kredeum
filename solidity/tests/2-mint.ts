// npx mocha --experimental-json-modules 2-mint.mjs
import { ethers } from "ethers";
import { expect } from "chai";
import { networks, contracts, getProvider } from "../../lib/config";
import OpenNFTs from "../../lib/open-nfts";

import type { Network, Contract } from "../../lib/config";
import type { Provider } from "@ethersproject/abstract-provider";

import { config } from "dotenv";
config();

const json = "https://ipfs.io/ipfs/bafkreibjtts66xh4ipz2sixjokrdsejfwe4dkpkmwnyvdrmuvehsh236ta";
const networkChainId = "0x13881";
const networkChainName = "mumbai";
const networkExplorer = "https://explorer-mumbai.maticvigil.com";
const contractAddress = "0x34538444A64251c765c5e4c9715a16723CA922D8";
const contractName = "Open NFTs";
const contractSymbol = "NFT";

let ethscan: string | undefined;
let network: Network | undefined;
let contract: Contract | undefined;
let provider: Provider | undefined;

describe("NFT Mint", function () {
  describe("Init", function () {
    it("Should find Network", function () {
      network = networks.find((nw) => nw.chainName === networkChainName);
      // console.log(network);
      expect(network?.chainId).to.be.equal(networkChainId);
    });

    it("Should find Chain Explorer", function () {
      ethscan = network?.blockExplorerUrls[0];
      expect(ethscan?.startsWith("https://")).to.be.true;
    });

    it("Should find Contract Config", function () {
      contract = contracts.find(
        (_contract) => _contract.address.toLowerCase() === contractAddress.toLowerCase()
      );
      // console.log(contract);
      expect(contract?.address).to.be.equal(contractAddress);
    });

    it("Should connect Provider", function () {
      network = networks.find((nw) => nw.chainName === networkChainName);
      expect(network).to.not.be.undefined;
      if (network) {
        provider = getProvider(network);
        expect(provider).to.not.be.undefined;
        expect(provider?._isProvider).to.be.true;
      }
    });

    it("Should get Signer", async function () {
      const signer = new ethers.Wallet(process.env.ACCOUNT_KEY || "", provider);
      expect(signer._isSigner).to.be.true;
    });
  });

  describe("Read", function () {
    let openNFTs: OpenNFTs;

    beforeEach(async () => {
      openNFTs = new OpenNFTs();
      openNFTs._setContract(networkChainId, contractAddress);
      await openNFTs.init(networkChainId, contractAddress);
    });

    it("Should init Contract", async function () {
      expect(Boolean(openNFTs)).to.be.true;
    });
    it("Should get Contract Name", async function () {
      expect(await openNFTs.contract?.name()).to.be.equal(contractName);
    });
    it("Should get Contract Symbol", async function () {
      expect(await openNFTs.contract?.symbol()).to.be.equal(contractSymbol);
    });
    it("Should get Contract TotalSupply", async function () {
      const totalSupply = (await openNFTs.contract?.totalSupply())?.toNumber();
      expect(totalSupply).to.be.gt(0);
    });
  });

  describe("Mint", function () {
    this.timeout(20000);

    it("Should Mint one Token", async function () {
      let openNFTs = new OpenNFTs();
      openNFTs._setContract(networkChainId, contractAddress);
      await openNFTs.init(networkChainId, contractAddress);
      const signer = new ethers.Wallet(process.env.ACCOUNT_KEY || "", provider);

      const totalSupply = (await openNFTs.contract?.totalSupply()).toNumber();
      const tx = await openNFTs.contract
        ?.connect(signer)
        .mintNFT(process.env.ACCOUNT_ADDRESS, json);
      expect((await tx.wait()).status).to.be.equal(1);

      const totalSupply1 = (await openNFTs.contract?.totalSupply()).toNumber();
      expect(totalSupply1).to.be.equal(totalSupply + 1);
    });
  });
});
