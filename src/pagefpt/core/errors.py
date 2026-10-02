class DomainError(Exception):
    def __init__(
        self,
        code: str,
        status: int = 400,
        message: str = "Request cannot be completed",
        fields=None,
    ):
        self.code, self.status, self.message, self.fields = code, status, message, fields or {}
        super().__init__(code)
