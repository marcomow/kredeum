<script lang="ts">
  import type { Collection } from "lib/ktypes";
  import type { Provider } from "@ethersproject/providers";

  import { collectionList, collectionListFromCache } from "lib/kcollection-list";
  import { collectionGetMetadata } from "lib/kcollection-get";
  import { nftsUrl, urlOwner, getOpenNFTsAddress } from "lib/kconfig";
  import { collectionName } from "lib/knfts";
  import { onMount } from "svelte";

  import { chainId, provider, owner } from "./network";

  // down to component
  export let filter = false;
  export let txt = false;
  // up to parent
  export let collection: Collection = undefined;

  let collectionAddress: string;
  let allCollections: Map<string, Collection>;
  let collections: Map<string, Collection>;
  let refreshingCollections: boolean;
  let open = false;

  const _setCollectionFromEvent = async (e: Event): Promise<void> => {
    return _setCollection((e.target as HTMLInputElement).value);
  };

  const _setCollection = async (_collectionAddress: string): Promise<void> => {
    if (_collectionAddress) {
      collectionAddress = _collectionAddress;

      // console.log("KredeumListCollections _setCollection", collectionAddress);

      if ($chainId && $owner && collectionAddress) {
        localStorage.setItem(`defaultCollection/${$chainId}/${$owner}`, collectionAddress);
        const coll = allCollections.get(urlOwner(nftsUrl($chainId, collectionAddress), $owner));
        collection = await collectionGetMetadata($chainId, coll, $provider);
      } else {
        collection = null;
      }
    }
  };

  // ON CHAINID or OWNER change THEN list collections
  $: _collectionList($chainId, $owner, $provider);

  const _collectionList = async (_chainId: number, _owner: string, _provider: Provider): Promise<void> => {
    // console.log("KredeumListCollections _collectionList", _chainId, _owner);
    if (_chainId && _owner) {
      _collectionListFromCache(_chainId, _owner, _provider);

      refreshingCollections = true;
      allCollections = await collectionList(_chainId, _owner, _provider);
      refreshingCollections = false;

      _collectionListFromCache(_chainId, _owner, _provider);
    }
  };

  const _collectionListFromCache = async (_chainId: number, _owner: string, _provider: Provider) => {
    // console.log("KredeumListCollections _collectionListFromCache");
    allCollections = collectionListFromCache(_owner);
    const openNFTsAddress = await getOpenNFTsAddress(_chainId, _provider);

    // console.log("allCollections", allCollections);
    collections = new Map(
      [...allCollections]
        .filter(
          ([, coll]) =>
            // FILTER NETWORK
            coll.chainId === _chainId &&
            // FILTER COLLECTION NOT EMPTY OR MINE OR DEFAULT
            (coll.balanceOf > 0 || coll.owner === _owner || coll.address === openNFTsAddress) &&
            // FILTER OpenNFTs collection
            (!filter || coll.openNFTsVersion)
        )
        // SORT PER SUPPLY DESC
        .sort(([, a], [, b]) => b.balanceOf - a.balanceOf)
    );
    // console.log("collections", collections);

    // SET DEFAULT COLLECTION
    const defaultCollection =
      localStorage.getItem(`defaultCollection/${_chainId}/${_owner}`) ||
      (await getOpenNFTsAddress($chainId, $provider));
    _setCollection(defaultCollection);
    // console.log(collections);
  };

  const collectionBalanceOf = (collContract: Collection) =>
    collContract?.balanceOf || (collContract?.balanceOf == 0 ? "0" : "?");
  const collectionNameAndBalanceOf = (collContract: Collection) =>
    collContract ? `${collectionName(collContract)} (${collectionBalanceOf(collContract)})` : "Choose collection";

  onMount(async () => {
    window.addEventListener("click", (e: Event): void => {
      if (!filter && !document.querySelector(".select-collection")?.contains(e.target as HTMLElement)) {
        open = false;
      }
    });
  });
</script>

{#if txt}
  {#if collections}
    {#if collections.size > 0}
      Collection
      <select on:change={(e) => _setCollectionFromEvent(e)}>
        {#each [...collections] as [url, coll]}
          <option selected={coll.address == collectionAddress} value={coll.address}>
            {collectionNameAndBalanceOf(coll)}
          </option>
        {/each}
      </select>
      {nftsUrl($chainId, collectionAddress)}
    {:else}
      NO Collection found !
    {/if}
  {:else if refreshingCollections}
    Refreshing Collection list...
  {/if}
{:else}
  <div class="select-wrapper select-collection" on:click={() => (open = !open)}>
    <div class="select" class:open>
      {#key refreshingCollections}
        {#if collections && collections.size > 0}
          <div class="select-trigger">
            <span>{collectionNameAndBalanceOf(collection)}</span>
          </div>
          <div class="custom-options">
            {#each [...collections] as [url, coll]}
              <span
                class="custom-option {coll.address == collectionAddress ? 'selected' : ''}"
                data-value={coll.address}
                on:click={() => _setCollection(coll.address)}
              >
                {collectionNameAndBalanceOf(coll)}
              </span>
            {/each}
          </div>
        {:else if refreshingCollections}
          <div class="select-trigger">Refreshing Collection list...</div>
        {:else}
          <div class="select-trigger"><em>NO Collection found !</em></div>
        {/if}
      {/key}
    </div>
  </div>
{/if}
