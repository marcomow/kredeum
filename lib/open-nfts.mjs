import { ethers } from "ethers";
import { configNetworks, configContracts, abis, getProvider, defaultChain } from "./config.mjs";

const LIMIT = 99;

class ClassOpenNfts {
  // private #fields not supported by firefox but ES2019
  configNetwork;
  configContract;
  supportsMetadata;
  supportsEnumerable;
  // _version0;
  // _version1;
  provider;
  okConfig;
  subgraph;
  currentContract;
  ok;

  constructor(_chainId, _contract) {
    this.setConfigNetwork(_chainId);
    this.setConfigContract(_contract);
  }

  setConfigNetwork(_chainId) {
    // SET configNetwork
    this.configNetwork =
      configNetworks.find((_network) => Number(_network.chainId) === Number(_chainId)) ||
      configNetworks.find((_network) => _network.chainName === defaultChain);
    // console.log("configNetwork", this.configNetwork);
  }

  setConfigContract(_address) {
    // SET configContract
    if (_address) {
      this.configContract = configContracts.find(
        (_contract) => _contract.address.toLowerCase() === _address.toLowerCase()
      ) || {
        address: _address,
        network: this.configNetwork?.chainName
      };
    } else {
      this.configContract = configContracts.find(
        (_contract) => _contract.network === this.configNetwork?.chainName
      );
    }
    // console.log("configContract", this.configContract);
    if (
      this.configContract?.network &&
      this.configContract?.network === this.configNetwork?.chainName
    ) {
      // SET subgraph.url
      this.subgraph = {
        url: this.configContract.subgraph?.url || this.configNetwork.subgraph?.url || false
      };
      this.provider = getProvider(this.configNetwork);
      this.okConfig = true;
    } else {
      console.error("Wrong network !", this.configContract?.network, this.configNetwork?.chainName);
    }
  }

  async setContract(_address) {
    if (_address) this.setConfigContract(_address);

    // Check contract
    const checkContract = new ethers.Contract(
      this.configContract.address,
      abis["ERC165"],
      this.provider
    );

    let abi = abis["ERC721"];

    const waitMetadata = checkContract.supportsInterface("0x5b5e139f");
    const waitEnumerable = checkContract.supportsInterface("0x780e9d63");
    [this.supportsMetadata, this.supportsEnumerable] = await Promise.all([
      waitMetadata,
      waitEnumerable
    ]);

    if (this.supportsMetadata) abi = abi.concat(abis["ERC721Metadata"]);
    if (this.supportsEnumerable) abi = abi.concat(abis["ERC721Enumerable"]);
    abi = abi.concat(abis["KREDEUMv1"]);

    // console.log("contract abi", abi);
    this.currentContract = new ethers.Contract(this.configContract.address, abi, this.provider);
    this.ok = true;
  }

  supportsSubgraph() {
    return this.subgraph?.url;
  }

  getAddress() {
    return this.currentContract.address;
  }

  async getSmartContract() {
    return {
      address: this.currentContract.address,
      name: await this.currentContract.name(),
      symbol: await this.currentContract.symbol(),
      totalSupply: await this.currentContract.totalSupply()
    };
  }

  async fetchJson(_url, _config = {}) {
    let json = {};
    if (_url) {
      try {
        const res = await fetch(_url, _config);
        // console.log(res);
        json = await res.json();
      } catch (e) {
        console.error("OpenNfts.fetchJson ERROR", e, _url, json);
      }
    } else {
      console.error("OpenNfts.fetchJson URL not defined");
    }
    return json;
  }

  async fetchGQL(_url, _query) {
    // console.log(`OpenNfts.fetchGQL\n${_url}\n${_query}`);

    const config = { method: "POST", body: JSON.stringify({ query: _query }) };
    const answerGQL = await this.fetchJson(_url, config);
    // console.log(answerGQL);

    if (answerGQL.errors) console.error("OpenNfts.fetchGQL ERROR", answerGQL.errors);
    return answerGQL.data;
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
  // IPFS?
  // jsonCID     = "bafaaa...aaaaaa"
  // imageCID    = "bafaaa...aaaaaa"
  ////////////////////////////////////////////////////////
  // SUBGRAPHDATA?
  // id = "0xaaa...aaa_nnn"
  ////////////////////////////////////////////////////////

  async fetchCov(_path) {
    const loginPass = "ckey_666650029327412c99ce8e3c5ef:";
    const url = `https://api.covalenthq.com/v1${_path}`;
    const config = {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${btoa(loginPass)}`
      }
    };
    const ret = await this.fetchJson(url, config);
    console.log("fetchCov", url, "=>", ret);
    return ret;
  }

  async getTokenFromContract(_owner, _index) {
    const token = {};
    try {
      if (_owner) {
        token.tokenID = (await this.currentContract.tokenOfOwnerByIndex(_owner, _index)).toString();
        token.owner = _owner;
      } else {
        token.tokenID = (await this.currentContract.tokenByIndex(_index)).toString();
        token.owner = await this.currentContract.ownerOf(token.tokenID);
      }
      token.contract = this.currentContract.address;

      if (this.supportsMetadata) {
        token.tokenURI = await this.currentContract.tokenURI(token.tokenID);
        this.addTokenMetadata(token, await this.fetchJson(token.tokenURI));
      }
    } catch (e) {
      console.error("OpenNfts.getTokenFromContract ERROR", e, token);
    }
    // console.log("OpenNfts.getTokenFromContract #" + token?.tokenID, token);
    return token;
  }

  addTokenMetadata(token, metadata) {
    token.metadata = metadata || {};
    token.image = token.image || metadata.image || "";
    token.name = token.name || metadata.name || "";
    token.description = token.description || metadata.description || "";
    token.minter = token.minter || metadata.minter || "";
  }

  async listTokensFromContract(_owner, _limit = LIMIT) {
    let tokens = [];

    try {
      const nbTokens = _owner
        ? (await this.currentContract.balanceOf(_owner)).toNumber()
        : (await this.currentContract.totalSupply()).toNumber();
      console.log("OpenNfts.listTokensFromContract totalSupply", nbTokens);

      const nbTokensLimit = nbTokens <= _limit ? nbTokens : _limit;

      for (let index = 0; index < nbTokensLimit; index++) {
        // console.log("OpenNfts.listTokensFromContract item", index + 1);
        tokens[index] = await this.getTokenFromContract(_owner, index);
      }
    } catch (e) {
      console.error("OpenNfts.listTokensFromContract ERROR", e);
    }

    console.log("OpenNfts.listTokensFromContract total", tokens.length);
    // console.log("OpenNfts.listTokensFromContract", tokens);
    return tokens;
  }

  async listTokensFromCovalent(_owner, _limit = LIMIT) {
    console.log("listTokensFromCovalent", _owner, _limit);

    let tokens = [];
    let path;
    const chainId = parseInt(this.configNetwork.chainId);
    const contract = this.currentContract.address.toLowerCase();

    if (_owner) {
      path =
        `/${chainId}/address/${_owner}/balances_v2/?nft=true` +
        `&no-nft-fetch=false` +
        `&match={contract_address:"${contract}"}`;

      const answerCov = await this.fetchCov(path);
      // console.log(path, answerCov);

      const tokensJson = answerCov?.data?.items[0]?.nft_data || [];
      // console.log(answerCov?.data?.items[0]);
      // console.log(tokensJson[0]);
      console.log(tokensJson);
      // console.log("OpenNfts.listTokensFromCovalent nbTokens", tokensJson.length);

      for (let index = 0; index < tokensJson.length; index++) {
        const _token = tokensJson[index];
        let token = {};
        const metadata = _token.external_data || (await this.fetchJson(_token.token_url));
        token.tokenID = _token.token_id;
        token.tokenURI = _token.token_url;
        token.minter = _token.original_owner || "";
        token.owner = _token.owner || "";
        token.contract = this.currentContract.address;
        this.addTokenMetadata(token, metadata);

        tokens.push(token);
      }
    }
    // console.log("OpenNfts.listTokensFromCovalent", tokens);

    return tokens;
  }

  async listTokensFromTheGraph(_owner, _limit = LIMIT) {
    let tokens = [];

    const currentContractAddress = this.currentContract.address.toLowerCase();
    const whereOwner = _owner ? `where: { owner: "${_owner.toLowerCase()}" }` : "";
    const query = `{
      tokenContract( id: "${currentContractAddress}" ) {
        tokens( first:${_limit} ${whereOwner} ) {
          id
          owner{
            id
          }
          tokenID
          tokenURI
          name
          description
          image
          metadata
        }
      }
    }`;
    console.log(query);
    const answerGQL = await this.fetchGQL(this.subgraph.url, query);
    const tokensJson = answerGQL?.tokenContract?.tokens || [];
    console.log(tokensJson[0]);
    // console.log("OpenNfts.listTokensFromTheGraph nbTokens", tokensJson.length);

    for (let index = 0; index < tokensJson.length; index++) {
      const token = tokensJson[index];
      let metadata;
      try {
        metadata = token.metadata && JSON.parse(token.metadata);
      } catch (e) {
        console.error("OpenNfts.listTokensFromTheGraph ERROR", e);
      }
      if (!metadata) {
        metadata = await this.fetchJson(token.tokenURI);
      }
      token.owner = token.owner?.id || "";
      token.contract = this.currentContract.address;
      this.addTokenMetadata(token, metadata);

      tokens.push(token);
    }

    console.log("OpenNfts.listTokensFromTheGraph", tokens.length);
    // console.log("OpenNfts.listTokensFromTheGraph", tokens);
    return tokens;
  }

  async listTokens(_owner, _limit = LIMIT) {
    const tokens = [];

    let tokenList;

    if (this.subgraph?.url) tokenList = await this.listTokensFromTheGraph(_owner);
    else {
      tokenList = await this.listTokensFromCovalent(_owner);
    }
    // if (this.supportsEnumerable) {
    //   tokenList = await this.listTokensFromContract(_owner);
    // }

    if (tokenList) {
      let nbTokens = 0;
      tokenList.sort((a, b) => b.tokenID - a.tokenID);
      tokenList.forEach((_token) => {
        // console.log("OpenNfts.listTokens", _token);

        if (++nbTokens <= _limit) {
          let cid = _token.metadata?.cid;
          if (!cid) {
            const img = _token.image;
            if (img) {
              const cid1 = img.match(/^ipfs:\/\/(.*)$/i);
              const cid2 = img.match(/^.*\/ipfs\/([^\/]*)(.*)$/i);
              cid = (cid1 && cid1[1]) || (cid2 && cid2[1]);
              // console.log('cid token#' + _token.tokenID, cid, '<=', img);
            }
          }
          _token.cid = cid;
          tokens.push(_token);
        }
      });
    }

    console.log("OpenNfts.listTokens", tokens.length);
    // console.log("OpenNfts.listTokens", tokens);
    return tokens;
  }

  async listContractsFromCovalent(_owner) {
    let contracts = [];
    let path;

    if (_owner) {
      const chainId = parseInt(this.configNetwork.chainId);
      path =
        `/${chainId}/address/${_owner}/balances_v2/?nft=true` +
        `&no-nft-fetch=true` +
        `&match={supports_erc:{$elemmatch:"erc721"}}`;

      const answerCov = await this.fetchCov(path);
      console.log(path, answerCov);

      const contractsJson = answerCov?.data?.items || [];
      // console.log(contractsJson[0]);
      // console.log("OpenNfts.listContractsFromCovalent nbContracts", contractsJson.length);

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
    console.log("OpenNfts.listContractsFromCovalent nbContracts ERC721", contracts.length);
    // console.log("OpenNfts.listContractsFromCovalent", contracts);

    return contracts;
  }

  async listContractsFromTheGraph(_owner) {
    let contracts = [];

    if (_owner) {
      const owner = _owner.toLowerCase();
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
      const answerGQL = await this.fetchGQL(this.subgraph?.url, query);
      const currentContracts = answerGQL?.ownerPerTokenContracts || [];
      // console.log(currentContracts[0]);

      for (let index = 0; index < currentContracts.length; index++) {
        const currentContractResponse = currentContracts[index];
        const currentContract = currentContractResponse.contract;
        contracts[index] = {
          address: currentContract.id,
          name: currentContract.name,
          symbol: currentContract.symbol,
          totalSupply: currentContractResponse.numTokens
        };
      }
    }
    // console.log("OpenNfts.listcontractsFromTheGraph", contracts);
    return contracts;
  }

  async listContracts(_owner) {
    let contracts;

    if (this.subgraph?.url) contracts = await this.listContractsFromTheGraph(_owner);
    else {
      contracts = await this.listContractsFromCovalent(_owner);
    }
    return contracts;
  }

  async Mint(_signer, _urlJson) {
    const address = await _signer.getAddress();

    console.log("OpenNfts.Mint", _urlJson, address, this.currentContract.address);

    //  const tx1 = await this.currentContract.connect(_signer).addUser(address, _urlJson);
    const tx1 = await this.currentContract.connect(_signer).mintNFT(address, _urlJson);
    console.log(`${this.configNetwork?.blockExplorerUrls[0]}/tx/` + tx1.hash);

    const res = await tx1.wait();
    //console.log(res.events);

    const tokenID = res.events[0].args[2].toString();
    return { chainId: this.configNetwork.chainId, address: this.currentContract.address, tokenID };
  }
}

async function OpenNfts(chainId, contract_address) {
  const openNfts = new ClassOpenNfts(chainId, contract_address);
  if (openNfts.okConfig) await openNfts.setContract();
  return openNfts;
}

export default OpenNfts;
