# Private data

What a buyer keeps for themselves is NIP-44 encrypted to their own key, in a kind 30078 they publish and only they can read. Nothing of it reaches our server.

| `d` tag | Holds |
|---|---|
| `nostrich/market/saved` | Saved listings. |
| `nostrich/market/addresses` | Saved delivery addresses. |
| `nostrich/market/recent` | Recently viewed listings. |

- A record is read before it is written, and **never written over a read no relay answered**: an empty answer is not the same as an empty list.
- Recently viewed is merged view by view across devices ([`src/private-data/recent.ts`](../src/private-data/recent.ts)): each view keeps its time, a clear is a time, so one device can never erase what another looked at.
- With a signer that asks the user for each signature, recently viewed stays on the device instead.
- An address a buyer types is never stored by us. It travels only inside the order's gift wrap, to the one seller.
