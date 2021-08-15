The documentation on icons extension icons is a bit spread out, but this what we're looking at:

* [https://developer.chrome.com/docs/extensions/mv2/manifest/icons/][chrome-manifest-icons]
* https://developer.chrome.com/docs/webstore/images/

* https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/#create-a-captivating-icon

Why do we only have icons in PNG format of 64x64 and 128x128 sizes? 128 is recommended in [chrome-manifest-icons]. 64 is for smaller icons, but so it can be scaled down to 16, 32 or 48. Why not just 48? Because there would be a lot of interpolated (smudged) pixels, as the source (svg) icon is 32x32 and we want the browser to handle interpolation by itself as it likes.

[chrome-manifest-icons]: https://developer.chrome.com/docs/extensions/mv2/manifest/icons/
