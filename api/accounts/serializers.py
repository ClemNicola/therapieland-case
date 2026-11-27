from django.contrib.auth import authenticate
from rest_framework import serializers

from accounts.models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name"]
        read_only_fields = fields


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=4096)

    default_error_messages = {"invalid_credentials": "Invalid email or password."}

    def validate(self, attrs: dict) -> dict:
        # One generic error whether the email is unknown, the password wrong or the account
        # deactivated: the response must not reveal which emails have an account.
        user = authenticate(
            self.context["request"], email=attrs["email"], password=attrs["password"]
        )
        if user is None:
            self.fail("invalid_credentials")
        return {"user": user}
