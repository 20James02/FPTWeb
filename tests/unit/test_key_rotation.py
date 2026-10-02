from pagefpt.core.crypto import Crypto


def test_old_ciphertext_decrypts_after_rotation():
    old = Crypto("a" * 32, "m" * 32, "t" * 32)
    ciphertext = old.encrypt("synthetic")
    new = Crypto("b" * 32, "m" * 32, "t" * 32, key_version="v2", previous_keys={"v1": "a" * 32})
    assert new.decrypt(ciphertext) == "synthetic"
    assert new.encrypt("synthetic").startswith("v2.")
    assert new.decrypt(new.encrypt("synthetic")) == "synthetic"
