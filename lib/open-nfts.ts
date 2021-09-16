import { ethers, BigNumber } from "ethers";
import { networks, contracts, abis, getProvider } from "./config";

import type { Contract as ContractEthers, Signer } from "ethers";
import type { Provider } from "@ethersproject/abstract-provider";
import type { Network, Contract, NftData, Metadata } from "./config";

const LIMIT = 99;

type AnswerFetchJson = {
  data?: any;
  error?: any;
};

class OpenNFTs {
  network?: Network;
  contract?: Contract;
  provider?: Provider;
  smartcontract?: ContractEthers;
  owner?: string; // optional NFT owner
  limit = LIMIT; // limit query results

  nftsFactory?: ContractEthers;

  supportsMetadata?: boolean;
  supportsEnumerable?: boolean;
  // _version0;
  // _version1;

  // Polygon / Matic
  defaultChainId = "0x89";

  constructor() {}

  // SET owner
  setOwner(_owner: string) {
    this.owner = _owner;
  }

  // SET limit
  setLimit(_limit: number) {
    this.limit = _limit;
  }

  // GET contract address with chain name
  getChainContractAddress() {
    return `${this.network?.chainName || ""}/${this.contract?.address || ""}`;
  }

  getNFTsFactory() {
    return this.nftsFactory;
  }

  getSubgraphUrl() {
    return (this.network?.subgraph?.active && this.network?.subgraph?.url) || "";
  }

  getCovalent() {
    return this.network?.covalent?.active;
  }

  // GET explorer
  getExplorer() {
    return this.network?.blockExplorerUrls[0] || "";
  }

  // GET OpenSea
  getOpenSea() {
    return this.network?.openSea || {};
  }

  // SET network
  _setNetwork(_chainId: string = this.defaultChainId): Network {
    const oldNetwork = this.network;

    // Search new network
    const newNetwork =
      _chainId &&
      networks.find((_network: Network) => Number(_network.chainId) === Number(_chainId));

    // Set new network if found and different from old one
    if (newNetwork && newNetwork !== oldNetwork) {
      this.network = newNetwork;
      this.provider = getProvider(newNetwork);
    }
    return this.network;
  }

  _setContract(_address?: string): Contract {
    let contract: Contract;

    if (_address) {
      // Search contract with this address on same network
      if (this.network) {
        contract = contracts.find(
          (_contract: Contract) =>
            _contract.address === _address && _contract.network === this.network?.chainName
        );
      }
      // Search first contract with same address on other networks
      else {
        contract = contracts.find((_contract: Contract) => _contract.address === _address);
      }
    } else if (this.network) {
      // Search first contract on current network
      contract = contracts.find(
        (_contract: Contract) => _contract.network === this.network?.chainName
      );
    }

    if (contract) {
      this.contract = contract;
    } else {
      console.error("No contract found");
    }

    return this.contract;
  }

  async init(
    _chainId?: string,
    _address?: string
  ): Promise<{ network: Network; contract: Contract }> {
    // console.log("init", _chainId, _address);

    // Set network with chainId (or default if network not set)
    this._setNetwork(_chainId) || this._setNetwork();

    // Set contract with address (or default)
    this._setContract(_address);

    if (this.contract?.address && this.provider) {
      try {
        const checkContract = new ethers.Contract(
          this.contract?.address,
          abis.ERC165,
          this.provider
        );

        let abi = abis.ERC721;

        const waitMetadata = checkContract.supportsInterface("0x5b5e139f");
        const waitEnumerable = checkContract.supportsInterface("0x780e9d63");
        [this.supportsMetadata, this.supportsEnumerable] = await Promise.all([
          waitMetadata,
          waitEnumerable
        ]);
        if (this.supportsMetadata) abi = abi.concat(abis.ERC721Metadata);
        if (this.supportsEnumerable) abi = abi.concat(abis.ERC721Enumerable);
        abi = abi.concat(abis.KredeumV2);
        this.smartcontract = new ethers.Contract(this.contract?.address, abi, this.provider);

        if (this.network?.nftsFactory) {
          this.nftsFactory = new ethers.Contract(
            this.network?.nftsFactory,
            abis.CloneFactory,
            this.provider
          );
        }
      } catch (e) {
        console.error("ERROR init", _chainId, _address, e);
      }
    }

    const ret = { network: this.network, contract: this.contract };
    console.log(`init ${_chainId} ${_address}`, ret);

    return ret;
  }

  async fetchJson(_url: string, _config: Object = {}): Promise<AnswerFetchJson> {
    let json: AnswerFetchJson = {};
    if (_url) {
      try {
        const res = await fetch(_url, _config);
        // console.log(res);
        json = await res.json();
      } catch (e) {
        console.error("OpenNFTs.fetchJson ERROR", e, _url, json);
        json = { error: e };
      }
    } else {
      const e = "OpenNFTs.fetchJson URL not defined";
      console.error(e);
      json = { error: e };
    }
    return json;
  }

  async fetchGQL(_url: string, _query: string) {
    console.log(`OpenNFTs.fetchGQL\n${_url}\n${_query}`);

    const config = { method: "POST", body: JSON.stringify({ query: _query }) };
    const answerGQL = (await this.fetchJson(_url, config)) as AnswerFetchJson;
    console.log(answerGQL);

    if (answerGQL.error) console.error("OpenNFTs.fetchGQL ERROR", answerGQL.error);
    return answerGQL.data;
  }

  async fetchCov(_path: string) {
    const loginPass = `${process.env.COVALENT_API_KEY}:`;
    const url = `https://api.covalenthq.com/v1${_path}&key=${loginPass}`;
    const config = {
      method: "GET",
      headers: {
        Authorization: `Basic ${btoa(loginPass)}`,
        Accept: "application/json"
      }
    };
    const json: AnswerFetchJson = await this.fetchJson(url, config);
    // console.log(url, "\n", json);
    return json;
  }

  ////////////////////////////////////////////////////////
  // TOKEN
  ////////////////////////////////////////////////////////
  // SMARTCONTRACT DATA
  // contract  = "0xaaa...aaa"
  // tokenID   = "nnn"
  // owner     = "0xbbb...bbb"
  ////////////////////////////////////////////////////////
  // METADATA?
  // tokenURI    = "https://ipfs.io/iofs/bafaaaaa...aaaa"
  // metadata    = {...}
  // image       =
  // name        = "image name"
  // description = "description image"
  // minter?     = ""
  ////////////////////////////////////////////////////////
  // NID = NFT ID = "0xaaa...aaa_nnn@chain"
  // CID = IPDS ID = "bax..."
  // PID = WP IP = "123"
  ////////////////////////////////////////////////////////

  cidExtract(_uri: string): string {
    let cid: string = "";
    if (_uri) {
      const cid1 = _uri.match(/^ipfs:\/\/(.*)$/i);
      const cid2 = _uri.match(/^.*\/ipfs\/([^\/]*)(.*)$/i);
      cid = (cid1 && cid1[1]) || (cid2 && cid2[1]) || "";
    }
    // console.log('cid' cid, '<=', _image);
    return cid;
  }

  addTokenDataSync(_token: NftData): NftData {
    const contract = _token.contract || this.contract?.address || "";
    const chainName = _token.chainName || this.network?.chainName || "";
    const metadata: Metadata = _token.metadata || {};
    const image = _token.image || metadata.image || "";

    return {
      tokenID: _token.tokenID || "",
      tokenURI: _token.tokenURI || "",

      contract,
      chainName,

      // metadata,
      image,

      name: _token.name || metadata.name || "",
      description: _token.description || metadata.description || "",

      creator: _token.creator || metadata.creator || "",
      minter: _token.minter || metadata.minter || "",
      owner: _token.owner || metadata.owner || "",

      cid:
        _token.cid ||
        metadata.cid ||
        this.cidExtract(_token.tokenURI) ||
        this.cidExtract(image) ||
        "",
      nid: _token.nid || `${chainName}/${contract?.toLowerCase()}/${_token.tokenID}`
    };
  }

  async addTokenData(_token: NftData): Promise<NftData> {
    _token.metadata = _token.metadata || (await this.fetchJson(_token.tokenURI)).data || {};
    return this.addTokenDataSync(_token);
  }

  async getNFTFromContract(_index: number): Promise<NftData> {
    let tokenID, tokenURI, owner;

    try {
      if (this.owner) {
        tokenID = (await this.smartcontract?.tokenOfOwnerByIndex(this.owner, _index)).toString();
        owner = this.owner;
      } else {
        tokenID = (await this.smartcontract?.tokenByIndex(_index)).toString();
        owner = await this.smartcontract?.ownerOf(tokenID);
      }
      if (this.supportsMetadata) {
        tokenURI = await this.smartcontract?.tokenURI(tokenID);
      }
    } catch (e) {
      console.error("OpenNFTs.getNFTFromContract ERROR", e, tokenID, tokenURI, owner);
    }
    // console.log("OpenNFTs.getNFTFromContract #" + tokenID, tokenURI, owner);
    return { tokenID, tokenURI, owner };
  }

  async listNFTsFromContract(owner?: string, limit?: number): Promise<Array<NftData>> {
    console.log("OpenNFTs.listNFTsFromContract", this.contract?.address);

    let tokens = [];

    try {
      const nbTokens = this.owner
        ? (await this.smartcontract?.balanceOf(this.owner)).toNumber()
        : (await this.smartcontract?.totalSupply()).toNumber();
      // console.log("OpenNFTs.listNFTsFromContract totalSupply", nbTokens);

      for (let index = 0; index < Math.min(nbTokens, this.limit); index++) {
        tokens[index] = await this.getNFTFromContract(index);
        // console.log("OpenNFTs.listNFTsFromContract item", index + 1, tokens[index]);
      }
    } catch (e) {
      console.error("OpenNFTs.listNFTsFromContract ERROR", e);
    }

    // console.log("OpenNFTs.listNFTsFromContract", tokens.length);
    // console.log("OpenNFTs.listNFTsFromContract", tokens);
    return tokens;
  }

  async listNFTsFromCovalent(owner?: string, limit?: number): Promise<Array<NftData>> {
    console.log("OpenNFTs.listNFTsFromCovalent", this.owner, this.limit);

    let tokens: Array<NftData> = [];
    let path;
    const chainId = parseInt(this.network?.chainId || "1");
    const contractAddress = this.contract?.address?.toLowerCase();

    if (this.owner) {
      const match = `{contract_address:"${contractAddress}"}`;
      path =
        `/${chainId}/address/${this.owner}/balances_v2/` +
        `?nft=true` +
        `&no-nft-fetch=false` +
        // `&limit=${this.limit}` + // not working with match...
        `&match=${encodeURIComponent(match)}`;

      console.log("listNFTsFromCovalent", path);
      const answerCov = await this.fetchCov(path);
      console.log("listNFTsFromCovalent", answerCov);

      if (answerCov.error) {
        console.error("answerCov.error", answerCov.error);
      } else {
        const tokensJson = answerCov?.data?.items[0]?.nft_data || [];
        // console.log(answerCov?.data?.items[0]);
        // console.log(tokensJson[0]);
        // console.log(tokensJson);
        // console.log("OpenNFTs.listNFTsFromCovalent nbTokens", tokensJson.length);

        for (let index = 0; index < Math.min(tokensJson.length, this.limit); index++) {
          const _token = tokensJson[index];

          tokens.push({
            tokenID: _token.token_id,
            tokenURI: _token.token_url,
            owner: _token.owner || this.owner || "",
            metadata: _token.external_data,
            minter: _token.original_owner || ""
          });
        }
      }
    }
    // console.log("OpenNFTs.listNFTsFromCovalent", tokens.length);
    // console.log("OpenNFTs.listNFTsFromCovalent", tokens);

    return tokens;
  }

  async listNFTsFromTheGraph(owner?: string, limit?: number): Promise<Array<NftData>> {
    console.log("OpenNFTs.listNFTsFromTheGraph", this.owner, this.limit);

    let tokens = [];

    const currentContractAddress = this.contract?.address?.toLowerCase();
    const whereOwner = this.owner
      ? `where: 
    { owner: "${this.owner.toLowerCase()}" }`
      : "";
    const query = `{
      tokenContract( id: "${currentContractAddress}" ) {
        tokens( first:${this.limit} ${whereOwner} ) {
          id
          owner{
            id
          }
          tokenID
          tokenURI
        }
      }
    }`;
    // metadata
    // name
    // description
    // image

    // console.log(query);
    const answerGQL = await this.fetchGQL(this.getSubgraphUrl() || "", query);
    const tokensJson = answerGQL?.tokenContract?.tokens || [];
    // console.log(tokensJson[0]);
    // console.log("OpenNFTs.listNFTsFromTheGraph nbTokens", tokensJson.length);
    // console.log(tokensJson);

    for (let index = 0; index < tokensJson.length; index++) {
      const _token = tokensJson[index];

      tokens.push({
        tokenID: _token.tokenID,
        tokenURI: _token.tokenURI,
        owner: _token.owner?.id || ""
        // metadata: _token.metadata && JSON.parse(_token.metadata),
        // name: _token.name,
        // description: _token.description,
        // image: _token.image
      });
    }

    // console.log("OpenNFTs.listNFTsFromTheGraph", tokens.length);
    // console.log("OpenNFTs.listNFTsFromTheGraph", tokens);
    return tokens;
  }

  async listContractsFromCovalent(): Promise<Array<Contract>> {
    let contracts: Array<Contract> = [];
    let path;

    if (this.owner) {
      const chainId = parseInt(this.network?.chainId || "1");
      const match = `{$or:[{supports_erc:{$elemmatch:"erc721"}},{supports_erc:{$elemmatch:"erc1155"}}]}`;

      path =
        `/${chainId}/address/${this.owner}/balances_v2/` +
        `?nft=true` +
        `&no-nft-fetch=false` +
        `&match=${encodeURIComponent(match)}`;

      const answerCov = await this.fetchCov(path);
      // console.log(path, answerCov);

      if (answerCov.error) {
        console.error("answerCov.error", answerCov.error);
      } else {
        const contractsJson = answerCov?.data?.items || [];
        // console.log(contractsJson[0]);
        // console.log("OpenNFTs.listContractsFromCovalent nbContracts", contractsJson.length);

        for (let index = 0; index < contractsJson.length; index++) {
          const contract = contractsJson[index];

          contracts.push({
            address: contract.contract_address,
            name: contract.contract_name,
            symbol: contract.contract_ticker_symbol,
            totalSupply: contract.balance
          });
        }
      }
    }
    // console.log("OpenNFTs.listContractsFromCovalent nbContracts ERC721", contracts.length);
    // console.log("OpenNFTs.listContractsFromCovalent", contracts);

    return contracts;
  }

  async listContractsFromTheGraph(): Promise<Array<Contract>> {
    console.log("OpenNFTs.listContractsFromTheGraph");
    let contracts: Array<Contract> = [];

    if (this.owner) {
      const owner = this.owner.toLowerCase();
      const query = `
        {
          ownerPerTokenContracts(
            where: {
              owner: "${owner}"
              }
          ) {
            contract {
              id
              name
              symbol
            }
            numTokens
          }
        }
    `;
      const answerGQL = await this.fetchGQL(this.getSubgraphUrl(), query);
      const currentContracts = answerGQL?.ownerPerTokenContracts || [];
      // console.log(currentContracts[0]);

      let index2 = 0;
      for (let index = 0; index < currentContracts.length; index++) {
        const currentContractResponse = currentContracts[index];
        const contract = currentContractResponse.contract;
        if (currentContractResponse.numTokens > 0) {
          contracts[index2] = {
            address: contract.id,
            name: contract.name,
            symbol: contract.symbol,
            totalSupply: Math.max(currentContractResponse.numTokens, 0)
          };
          index2++;
        }
      }
    }
    // console.log("OpenNFTs.listcontractsFromTheGraph", contracts);
    return contracts;
  }

  async listNFTs(_owner?: string, _type?: string): Promise<Array<NftData>> {
    console.log("OpenNFTs.listNFTs", _owner, _type, this.contract?.address);
    let nfts: Array<NftData> = [];
    let type: string;

    if (this.getSubgraphUrl()) {
      nfts = (await this.listNFTsFromTheGraph(this.owner, this.limit)) as Array<NftData>;
      type = "subgraph";
    } else if (this.supportsEnumerable) {
      nfts = (await this.listNFTsFromContract(this.owner, this.limit)) as Array<NftData>;
      type = "contract";
    } else if (this.getCovalent()) {
      nfts = (await this.listNFTsFromCovalent(this.owner, this.limit)) as Array<NftData>;
      type = "covalent";
    } else {
      console.error("No way to list NFTs :-(");
    }

    if (nfts.length) {
      nfts.sort((a, b) => (BigNumber.from(b.tokenID).gt(BigNumber.from(a.tokenID)) ? 1 : -1));
      for (let index = 0; index < Math.min(nfts.length, this.limit); index++) {
        const token: NftData = await this.addTokenData(nfts[index]);
        if (_owner === "undefined" || token?.owner?.toLowerCase() === _owner?.toLowerCase()) {
          nfts[index] = token;
        }

        if (typeof localStorage !== "undefined") {
          const tokenJson = JSON.stringify(token, null, 2);
          localStorage.setItem(`nft://${token.nid}`, tokenJson);
        }
      }
    }

    // console.log("OpenNFTs.listNFTs", nfts.length);
    console.log(`OpenNFTs.listNFTs from ${this.contract?.address} from ${type}`, nfts);
    return nfts;
  }

  listNFTsFromCache(_owner: string): Array<NftData> {
    const chainContract = this.getChainContractAddress()?.toLowerCase();
    console.log("OpenNFTs.listNFTsFromCache", _owner, chainContract);

    const tokens: Array<NftData> = [];

    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);

      if (key?.startsWith("nft://") && key?.includes(chainContract)) {
        const token = JSON.parse(localStorage.getItem(key) || "{}");
        if (_owner === "undefined" || token?.owner?.toLowerCase() === _owner?.toLowerCase()) {
          tokens.push(token);
        }
      }
    }
    tokens.sort((a, b) => (BigNumber.from(b.tokenID) > BigNumber.from(a.tokenID) ? 1 : 0));

    console.log(`OpenNFTs.listNFTsFromCache ${tokens.length}`);
    return tokens.length > 0 && tokens;
  }

  listContractsFromConfig(): Array<Contract> {
    console.log("OpenNFTs.listContractsFromConfig");
    let _contracts: Array<Contract> = contracts.filter(
      (_contract: Contract) => _contract.network === this.network?.chainName
    );

    console.log("OpenNFTs.listContractsFromConfig", _contracts);
    return _contracts;
  }

  async listContractsFromFactory() {
    console.log("OpenNFTs.listContractsFromFactory");

    let implementations = [];
    if (this.nftsFactory) {
      implementations = await this.nftsFactory.implementations();
    }
    return implementations.map((k: any) => ({ address: k }));
  }

  async listContracts(): Promise<Array<Contract>> {
    console.log("OpenNFTs.listContracts");
    let contracts: Array<Contract> = [];
    let contractsKredeum: Array<Contract> = [];
    let contractsOwner: Array<Contract> = [];

    // GET user contracts
    if (this.getSubgraphUrl()) {
      contractsOwner = await this.listContractsFromTheGraph();
    } else if (this.getCovalent()) {
      contractsOwner = await this.listContractsFromCovalent();
    }

    if (this.getNFTsFactory()) {
      // GET Kredeum contracts from Factory
      contractsKredeum = await this.listContractsFromFactory();
    } else {
      // GET Kredeum contracts from Config
      contractsKredeum = this.listContractsFromConfig();
    }

    // MERGE contractsOwner and contractsKredeum
    contracts = contractsOwner.concat(
      contractsKredeum.filter((contract: Contract) => contractsOwner.indexOf(contract) < 0)
    );

    // contracts.forEach((contract) => {
    //   if (contract.totalSupply === undefined) {
    //     contract.totalSupply = await;
    //   }
    // });

    if (typeof localStorage !== "undefined") {
      console.log(contracts);
      contracts?.forEach((contract) => {
        localStorage.setItem(
          `nfts://${this.network?.chainName}/${contract.address?.toLowerCase()}`,
          JSON.stringify(contract, null, 2)
        );
      });
    }
    console.log("OpenNFTs.listContracts", contracts);
    return contracts;
  }

  listContractsFromCache() {
    console.log("OpenNFTs.listContractsFromCache");
    const contracts = [];

    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);

      if (key?.startsWith("nfts://")) {
        const contract = JSON.parse(localStorage.getItem(key) || "{}");
        contracts.push(contract);
      }
    }
    return contracts;
  }

  async Clone(_signer: Signer) {
    const address = await _signer.getAddress();

    console.log("OpenNFTs.Clone", address, this.contract?.address);

    const tx1 = await this.nftsFactory?.connect(_signer).clone();
    console.log(`${this.network?.blockExplorerUrls[0]}/tx/` + tx1.hash);

    const res = await tx1.wait();
    console.log(res.status);

    console.log(res);
    console.log(BigNumber.from(res.events[0]?.data).toHexString());

    return BigNumber.from(res.events[0]?.data).toHexString();
  }

  async Mint(_signer: Signer, _urlJson: string) {
    const address = await _signer.getAddress();

    console.log("OpenNFTs.Mint", _urlJson, address, this.contract?.address);

    //  const tx1 = await this.contract?.connect(_signer).addUser(address, _urlJson);
    const txOptions = {
      maxFeePerGas: ethers.utils.parseUnits("50", "gwei"),
      type: 2
    };

    const tx1 = await this.smartcontract?.connect(_signer).mintNFT(address, _urlJson, txOptions);
    console.log(`${this.network?.blockExplorerUrls[0]}/tx/` + tx1.hash);

    const res = await tx1.wait();
    //console.log(res.events);

    const token = await this.addTokenData({
      tokenID: res.events[0]?.args[2]?.toString(),
      tokenURI: _urlJson,
      creator: address,
      minter: address,
      owner: address
    });

    return token;
  }
}

export default OpenNFTs;
