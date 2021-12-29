import type { Signer } from "ethers";
import type { Nft } from "./ktypes";
import type { TransactionResponse } from "@ethersproject/abstract-provider";

import { getCollection } from "./klist-nfts";
import { getNetwork } from "./kconfig";

const transferNft = async (nft: Nft, owner: Signer): Promise<TransactionResponse | null> => {
  let txResp: TransactionResponse | null = null;

  if (nft) {
    const random = "0x442579caa4121df038851b802a382b28313c70e5";
    const network = getNetwork(nft.chainId);
    const ownerAddress = await owner.getAddress();
    console.log("transferNft", nft, ownerAddress);

    const openNFTs = await getCollection(nft.chainId, nft.collection, owner);

    txResp = await openNFTs.connect(owner).transferFrom(ownerAddress, random, nft.tokenID);
    console.log(`${network?.blockExplorerUrls[0]}/tx/${txResp?.hash}`);
  }

  return txResp;
};

export { transferNft };
