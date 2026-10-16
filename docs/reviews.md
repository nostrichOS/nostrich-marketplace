# Reviews

A review is a kind 31555 about a listing or a whole shop. Code: [`src/reviews/`](../src/reviews/).

```
kind 31555
["d", "a:30402:<seller>:<d>"]          a listing, or "a:30402:<seller>" for the shop
["rating", "1", "thumb"]               1 went well, 0 did not
["rating", "0.8", "delivery"]          optional, 0 to 1
["rating", "1", "quality"]             optional
["rating", "1", "communication"]       optional
content: the review's words
```

- **Score:** half the thumb and half the mean of the other ratings; the thumb alone when there are no others.
- **What is shown:** one review per reviewer, their newest; never the seller's own.
- A kind 31555 whose `d` does not name a listing or a shop is not a seller review, and is ignored.
